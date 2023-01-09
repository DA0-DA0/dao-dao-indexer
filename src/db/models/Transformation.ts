import { Op, Sequelize, WhereOptions } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import {
  Block,
  ParsedEvent,
  ProcessedTransformer,
  SplitDependentKeys,
  getDependentKey,
  loadConfig,
} from '@/core'
import { getProcessedTransformers } from '@/data/transformers'

import { Contract } from './Contract'

@Table({
  timestamps: true,
  indexes: [
    // Transformers are deterministic and names must be unique so they can be
    // found, so only one output can exist for a name on a contract at a given
    // block height.
    {
      unique: true,
      fields: ['contractAddress', 'name', 'blockHeight'],
    },
    {
      // Speeds up queries. Use trigram index for string name to speed up
      // partial matches (LIKE).
      fields: [Sequelize.literal('name gin_trgm_ops'), 'blockHeight'],
      concurrently: true,
      using: 'gin',
    },
    {
      // Speeds up queries.
      fields: ['value'],
      concurrently: true,
      using: 'gin',
    },
  ],
})
export class Transformation extends Model {
  @AllowNull(false)
  @ForeignKey(() => Contract)
  @Column
  contractAddress!: string

  @BelongsTo(() => Contract)
  contract!: Contract

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockHeight!: number

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockTimeUnixMs!: number

  @AllowNull(false)
  @Column(DataType.TEXT)
  name!: string

  @AllowNull
  @Column(DataType.JSONB)
  value!: unknown | null

  get block(): Block {
    return {
      height: this.blockHeight,
      timeUnixMs: this.blockTimeUnixMs,
    }
  }

  get dependentKey(): string {
    return getDependentKey(this.contractAddress, this.name)
  }

  // Split dependent keys into two groups: non map keys and map prefixes. Map
  // prefixes end with a colon because they are missing the final key segment,
  // which is the key of each map entry.
  static splitDependentKeys(dependentKeys: string[]): SplitDependentKeys {
    return {
      nonMapKeys: dependentKeys.filter((key) => key[key.length - 1] !== ':'),
      mapPrefixes: dependentKeys.filter((key) => key[key.length - 1] === ':'),
    }
  }

  // Returns a where clause that will match all transformations that are
  // described by the dependent keys, which contain various contract addresses
  // and names.
  static getWhereClauseForDependentKeys(dependentKeys: string[]): WhereOptions {
    // Some keys (most likely those with wildcards) may not have a contract
    // address. It is fine to group these together.
    const dependentNamesByContract = dependentKeys.reduce(
      (acc, dependentKey) => {
        // Dependent keys for any contract start with "%:".
        const [contractAddress, name] = dependentKey.startsWith('%:')
          ? ['', dependentKey]
          : [
              dependentKey.split(':')[0],
              // name can have colons in it, so rejoin rest of string.
              dependentKey.split(':').slice(1).join(':'),
            ]
        return {
          ...acc,
          [contractAddress]: [...(acc[contractAddress] ?? []), name],
        }
      },
      {} as Record<string, string[] | undefined>
    )

    return {
      [Op.or]: Object.entries(dependentNamesByContract).map(
        ([contractAddress, dependentKeys]) => {
          const { mapPrefixes } = Transformation.splitDependentKeys(
            dependentKeys!
          )

          // It's also possible that a map prefix is a non-map name, since names
          // can contain any character, including a colon (which is the map
          // separator), so we need to check all names as non-map matches.
          const exactNames = dependentKeys!.filter(
            (name) => !name.includes('%')
          )
          const wildcardNames = dependentKeys!.filter((name) =>
            name.includes('%')
          )

          return {
            // Only include if contract address is defined.
            ...(contractAddress && { contractAddress }),
            // Same logic as in `updateComputationValidityDependentOnChanges` in
            // `src/db/utils.ts`.
            name: {
              [Op.or]: [
                // Where name is one of the names.
                ...(exactNames.length > 0 ? [{ [Op.in]: exactNames }] : []),
                ...wildcardNames.map((name) => ({
                  [Op.like]: name,
                })),
                // Or where key is prefixed by one of the map prefixes.
                ...mapPrefixes.map((prefix) => ({
                  [Op.like]: prefix + '%',
                })),
              ],
            },
          }
        }
      ),
    }
  }

  static async transformParsedEvents(
    events: ParsedEvent[]
  ): Promise<Transformation[]> {
    const transformers = getProcessedTransformers(loadConfig())
    if (transformers.length === 0) {
      return []
    }

    // Collect all pending transformations before evaluating them. This is
    // because some transformations may depend on the value of previous
    // transformations, which may exist in this current set of uncommitted
    // transformations. Thus, we need to evaluate them sequentially.
    const unevaluatedTransformations: UnevaluatedEventTransformation[] =
      events.flatMap((event) => {
        const transformersForEvent = transformers.filter((transformer) =>
          transformer.filter(event)
        )

        return transformersForEvent
          .map((transformer) => {
            // Wrap in try/catch in case a transformer errors. Don't want to
            // prevent other events from transforming correctly.
            let name
            try {
              name =
                typeof transformer.name === 'string'
                  ? transformer.name
                  : transformer.name(event)
            } catch (error) {
              // TODO: Store somewhere.
              console.error(
                `Error getting transformation name for event ${event.blockHeight}/${event.contractAddress}/${event.key}: ${error}`
              )
              return undefined
            }

            return {
              event,
              transformer,
              pendingTransformation: {
                contractAddress: event.contractAddress,
                blockHeight: event.blockHeight,
                blockTimeUnixMs: event.blockTimeUnixMs,
                name,
                value: undefined,
              },
            }
          })
          .filter((t): t is UnevaluatedEventTransformation => !!t)
      })

    const evaluatedTransformations: PendingTransformation[] = []

    // Evaluate all pending transformations sequentially.
    for (const {
      event,
      transformer,
      pendingTransformation,
    } of unevaluatedTransformations) {
      // Wrap in try/catch in case a transformer errors. Don't want to prevent
      // other events from transforming correctly.
      try {
        pendingTransformation.value =
          event.delete && !transformer.manuallyTransformDeletes
            ? null
            : (await transformer.getValue(event, async () => {
                // Find most recent transformation for this contract and name before
                // this block.

                // Check evaluated transformations in case the most recent
                // transformation is in the current group of events.
                const evaluatedTransformation = evaluatedTransformations
                  .filter(
                    (transformation) =>
                      transformation.contractAddress ===
                        pendingTransformation.contractAddress &&
                      transformation.name === pendingTransformation.name
                  )
                  .slice(-1)[0]

                if (evaluatedTransformation) {
                  return evaluatedTransformation.value
                }

                // Fallback to database.
                return (
                  (
                    await Transformation.findOne({
                      where: {
                        contractAddress: event.contractAddress,
                        name: pendingTransformation.name,
                        blockHeight: {
                          [Op.lt]: event.blockHeight,
                        },
                      },
                      order: [['blockHeight', 'DESC']],
                    })
                  )?.value ?? null
                )
              })) ?? null

        // Update the latest transformation for the same contract, name, and block
        // height if it exists. We want this newer transformation to be able to
        // access the previous value during its evaluation, in case the
        // transformation is iterating on values, such as a counter, but only one
        // transformation can exist for a contract, name, and block height set.
        const latestTransformation = evaluatedTransformations
          .filter(
            (transformation) =>
              transformation.contractAddress ===
                pendingTransformation.contractAddress &&
              transformation.name === pendingTransformation.name &&
              transformation.blockHeight === pendingTransformation.blockHeight
          )
          .slice(-1)[0]

        if (latestTransformation) {
          latestTransformation.value = pendingTransformation.value
        } else {
          evaluatedTransformations.push(pendingTransformation)
        }
      } catch (error) {
        // TODO: Store somewhere.
        console.error(
          `Error transforming event ${event.blockHeight}/${event.contractAddress}/${event.key}: ${error}`
        )
      }
    }

    if (evaluatedTransformations.length === 0) {
      return []
    }

    // Save all pending transformations.
    return await Transformation.bulkCreate(evaluatedTransformations, {
      updateOnDuplicate: ['value'],
    })
  }
}

type PendingTransformation = {
  contractAddress: string
  blockHeight: number
  blockTimeUnixMs: number
  name: string
  value: any | null
}

type UnevaluatedEventTransformation = {
  event: ParsedEvent
  transformer: ProcessedTransformer
  pendingTransformation: PendingTransformation
}
