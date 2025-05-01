import { Op, WhereOptions } from 'sequelize'
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
  DependableEventModel,
  DependentKeyNamespace,
  ParsedWasmStateEvent,
} from '@/types'
import { getDependentKey } from '@/utils'

import { Contract } from './Contract'

@Table({
  timestamps: true,
  indexes: [
    // Only one event can happen to a key for a given contract at a given block
    // height. This ensures events are not duplicated if they attempt exporting
    // multiple times.
    {
      unique: true,
      fields: ['blockHeight', 'contractAddress', 'key'],
    },
    {
      // Speeds up queries finding latest key for a contract. Composite indexes
      // are most efficient when equality tests are first and ranges second.
      fields: ['contractAddress', 'blockHeight'],
    },
    {
      // Speeds up queries finding first newer dependent key to validate a
      // computation.
      fields: ['key'],
    },
    {
      // Speed up ordering queries.
      fields: ['blockHeight'],
    },
    {
      // Speed up ordering queries.
      fields: ['blockTimeUnixMs'],
    },
  ],
})
export class WasmStateEvent extends DependableEventModel {
  @AllowNull(false)
  @ForeignKey(() => Contract)
  @Column(DataType.STRING)
  declare contractAddress: string

  @BelongsTo(() => Contract)
  declare contract: Contract

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockHeight: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockTimeUnixMs: string

  @AllowNull(false)
  @Column(DataType.DATE)
  declare blockTimestamp: Date

  // Key is stored as a comma separated list of uint8 values that represents a
  // byte array. The byte array datatype doesn't allow for prefix queries, so we
  // have to manually encode binary data in a format that allows for
  // database-level prefix queries (i.e. LIKE prefix%). We want database-level
  // prefixing so we can efficiently query for all values in a map.
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare key: string

  // JSON encoded value. Empty string if `delete` is true.
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare value: string

  @AllowNull
  @Column(DataType.JSONB)
  declare valueJson: any | null

  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  declare delete: boolean

  get block(): Block {
    return {
      height: BigInt(this.blockHeight),
      timeUnixMs: BigInt(this.blockTimeUnixMs),
    }
  }

  get dependentKey(): string {
    return getDependentKey(
      WasmStateEvent.dependentKeyNamespace,
      this.contractAddress,
      this.key
    )
  }

  get asParsedEvent(): ParsedWasmStateEvent {
    // `Contract` must be included before using this getter.
    if (!this.contract) {
      throw new Error('Contract must be included when querying for this Event.')
    }

    return {
      type: 'state',
      codeId: this.contract.codeId,
      contractAddress: this.contractAddress,
      blockHeight: this.blockHeight,
      blockTimeUnixMs: this.blockTimeUnixMs,
      blockTimestamp: this.blockTimestamp,
      key: this.key,
      value: this.value,
      valueJson: this.valueJson,
      delete: this.delete,
    }
  }

  // Get the previous event for this key. If this is the first event for this
  // key, return null. Cache the result so it can be reused since this shouldn't
  // change.
  previousEvent?: WasmStateEvent | null
  async getPreviousEvent(cache = true): Promise<WasmStateEvent | null> {
    if (this.previousEvent === undefined || !cache) {
      this.previousEvent = await WasmStateEvent.findOne({
        where: {
          contractAddress: this.contractAddress,
          key: this.key,
          blockHeight: {
            [Op.lt]: this.blockHeight,
          },
        },
        order: [['blockHeight', 'DESC']],
      })
    }

    return this.previousEvent
  }

  static dependentKeyNamespace = DependentKeyNamespace.WasmStateEvent
  static blockHeightKey: string = 'blockHeight'
  static blockTimeUnixMsKey: string = 'blockTimeUnixMs'

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
            key: {
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
}
