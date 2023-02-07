import { Worker } from 'worker_threads'

import { Op, WhereOptions } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { Block, ParsedEvent, SplitDependentKeys, getDependentKey } from '@/core'

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
export class Event extends Model {
  @AllowNull(false)
  @ForeignKey(() => Contract)
  @Column
  contractAddress!: string

  @BelongsTo(() => Contract)
  contract!: Contract

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockHeight!: bigint

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockTimeUnixMs!: bigint

  @AllowNull(false)
  @Column(DataType.DATE)
  blockTimestamp!: Date

  // Key is stored as a comma separated list of uint8 values that represents a
  // byte array. The byte array datatype doesn't allow for prefix queries, so we
  // have to manually encode binary data in a format that allows for
  // database-level prefix queries (i.e. LIKE prefix%). We want database-level
  // prefixing so we can efficiently query for all values in a map.
  @AllowNull(false)
  @Column(DataType.TEXT)
  key!: string

  // JSON encoded value. Empty string if `delete` is true.
  @AllowNull(false)
  @Column(DataType.TEXT)
  value!: string

  @AllowNull
  @Column(DataType.JSONB)
  valueJson!: any | null

  @AllowNull(false)
  @Column
  delete!: boolean

  get block(): Block {
    return {
      height: this.blockHeight,
      timeUnixMs: this.blockTimeUnixMs,
    }
  }

  get dependentKey(): string {
    return getDependentKey(this.contractAddress, this.key)
  }

  get asParsedEvent(): ParsedEvent {
    // `Contract` must be included before using this getter.
    if (!this.contract) {
      throw new Error('Contract must be included when querying for this Event.')
    }

    return {
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

  // Split dependent keys into two groups: non map keys and map prefixes. Map
  // prefixes end with a comma because they are missing the final key segment,
  // which is the key of each map entry.
  static splitDependentKeys(dependentKeys: string[]): SplitDependentKeys {
    return {
      nonMapKeys: dependentKeys.filter((key) => key[key.length - 1] !== ','),
      mapPrefixes: dependentKeys.filter((key) => key[key.length - 1] === ','),
    }
  }

  // Returns a where clause that will match all events that are described by the
  // dependent keys, which contain various contract addresses, non map keys
  // (potentially containing wildcards), and map prefix keys.
  static getWhereClauseForDependentKeys(dependentKeys: string[]): WhereOptions {
    // Some keys (most likely those with wildcards) may not have a contract
    // address. It is fine to group these together.
    const dependentKeysByContract = dependentKeys.reduce(
      (acc, dependentKey) => {
        // Dependent keys for any contract start with "%:".
        const [contractAddress, key] = dependentKey.startsWith('%:')
          ? ['', dependentKey]
          : dependentKey.split(':')
        return {
          ...acc,
          [contractAddress]: [...(acc[contractAddress] ?? []), key],
        }
      },
      {} as Record<string, string[] | undefined>
    )

    return {
      [Op.or]: Object.entries(dependentKeysByContract).map(
        ([contractAddress, keys]) => {
          const { nonMapKeys, mapPrefixes } = Event.splitDependentKeys(keys!)

          const exactKeys = nonMapKeys.filter((key) => !key.includes('%'))
          const wildcardKeys = nonMapKeys.filter((key) => key.includes('%'))

          return {
            // Only include if contract address is defined.
            ...(contractAddress && { contractAddress }),
            // Same logic as in `updateComputationValidityDependentOnChanges` in
            // `src/db/utils.ts`.
            key: {
              [Op.or]: [
                // Where key is one of the non map keys.
                ...(exactKeys.length > 0 ? [{ [Op.in]: exactKeys }] : []),
                ...wildcardKeys.map((key) => ({
                  [Op.like]: key,
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
}
