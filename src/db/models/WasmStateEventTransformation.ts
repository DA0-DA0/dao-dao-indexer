import { Op, Sequelize, WhereOptions } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript'

import {
  Block,
  ComputationDependentKey,
  ParsedWasmStateEvent,
  ProcessedTransformer,
  getDependentKey,
  loadConfig,
} from '@/core'
import { getProcessedTransformers } from '@/data/transformers'

import { DependendableEventModel, DependentKeyNamespace } from '../types'
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
      fields: [Sequelize.literal('name gin_trgm_ops')],
      concurrently: true,
      using: 'gin',
    },
    {
      // Speeds up queries.
      fields: ['value'],
      concurrently: true,
      using: 'gin',
    },
    {
      // Speeds up queries.
      fields: ['blockHeight'],
    },
  ],
})
export class WasmStateEventTransformation extends DependendableEventModel {
  @AllowNull(false)
  @ForeignKey(() => Contract)
  @Column
  contractAddress!: string

  @BelongsTo(() => Contract)
  contract!: Contract

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockHeight!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockTimeUnixMs!: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  name!: string

  @AllowNull
  @Column(DataType.JSONB)
  value!: unknown | null

  get block(): Block {
    return {
      height: BigInt(this.blockHeight),
      timeUnixMs: BigInt(this.blockTimeUnixMs),
    }
  }

  get dependentKey(): string {
    return getDependentKey(
      WasmStateEventTransformation.dependentKeyNamespace,
      this.contractAddress,
      this.name
    )
  }

  static dependentKeyNamespace =
    DependentKeyNamespace.WasmStateEventTransformation
  static blockHeightKey: string = 'blockHeight'

  // Returns a where clause that will match all events that are described by the
  // dependent keys.
  static getWhereClauseForDependentKeys(
    dependentKeys: ComputationDependentKey[]
  ): WhereOptions {
    // Some keys (most likely those with wildcards) may not have a contract
    // address. It is fine to group these together.
    const dependentKeysByContract = dependentKeys.reduce(
      (acc, dependentKey) => {
        // 1. Remove namespace from key.
        let key = dependentKey.key.replace(
          new RegExp(`^${this.dependentKeyNamespace}:`),
          ''
        )

        // 2. Extract contract address from key.
        // Dependent keys for any contract start with "*:".
        const contractAddress = key.startsWith('*:') ? '' : key.split(':')[0]

        key = key
          // 3. Remove contract address from key.
          .replace(new RegExp(`^${contractAddress || '\\*'}:`), '')
          // 4. Replace wildcard symbol with LIKE wildcard for database query.
          .replace(/\*/g, '%')

        return {
          ...acc,
          [contractAddress]: [
            ...(acc[contractAddress] ?? []),
            {
              key,
              prefix: dependentKey.prefix,
            },
          ],
        }
      },
      {} as Record<string, { key: string; prefix: boolean }[]>
    )

    return {
      [Op.or]: Object.entries(dependentKeysByContract).map(
        ([contractAddress, keys]) => {
          const exactKeys = keys
            .filter(({ key, prefix }) => !prefix && !key.includes('%'))
            .map(({ key }) => key)
          const wildcardKeys = keys
            .filter(({ key, prefix }) => prefix || key.includes('%'))
            .map(({ key, prefix }) => key + (prefix ? '%' : ''))

          return {
            // Only include if contract address is defined.
            ...(contractAddress && { contractAddress }),
            // Related logic in `makeComputationDependencyWhere` in
            // `src/db/utils.ts`.
            name: {
              [Op.or]: [
                // Exact matches.
                ...(exactKeys.length > 0 ? [{ [Op.in]: exactKeys }] : []),
                // Wildcards. May or may not be prefixes.
                ...wildcardKeys.map((key) => ({
                  [Op.like]: key,
                })),
              ],
            },
          }
        }
      ),
    }
  }

  static async transformParsedStateEvents(
    events: ParsedWasmStateEvent[]
  ): Promise<WasmStateEventTransformation[]> {
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

            // If name is empty string or undefined, can't transform.
            if (!name) {
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
            : await transformer.getValue(event, async () => {
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
                    await WasmStateEventTransformation.findOne({
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
              })

        if (pendingTransformation.value === undefined) {
          // Skip saving this transformation if the value is undefined.
          continue
        }

        // Update the latest transformation for the same contract, name, and
        // block height if it exists. We want this newer transformation to be
        // able to access the previous value during its evaluation, in case the
        // transformation is iterating on values, such as a counter, but only
        // one transformation can exist for a contract, name, and block height
        // set.
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
    return await WasmStateEventTransformation.bulkCreate(
      evaluatedTransformations,
      {
        updateOnDuplicate: ['value'],
      }
    )
  }
}

type PendingTransformation = {
  contractAddress: string
  blockHeight: string
  blockTimeUnixMs: string
  name: string
  value: any | null
}

type UnevaluatedEventTransformation = {
  event: ParsedWasmStateEvent
  transformer: ProcessedTransformer
  pendingTransformation: PendingTransformation
}
