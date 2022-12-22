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

import { Block } from '../../core/types'
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
  blockHeight!: number

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockTimeUnixMs!: number

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

  // JSON encoded value.
  @AllowNull
  @Column(DataType.TEXT)
  value!: string | null

  @AllowNull(false)
  @Column
  delete!: boolean

  // Split dependent keys into two groups: non map keys and map prefixes. Map
  // prefixes end with a comma because they are missing the final key segment,
  // which is the key of each map entry.
  static splitDependentKeys(dependentKeys: string[]): {
    nonMapKeys: string[]
    mapPrefixes: string[]
  } {
    return {
      nonMapKeys: dependentKeys.filter((key) => key[key.length - 1] !== ','),
      mapPrefixes: dependentKeys.filter((key) => key[key.length - 1] === ','),
    }
  }

  // Returns a where clause that will match all events that are described by the
  // dependent keys, which contain various contract addresses, non map keys, and
  // map prefix keys.
  static getWhereClauseForDependentKeys(dependentKeys: string[]): WhereOptions {
    const dependentKeysByContract = dependentKeys.reduce(
      (acc, dependentKey) => {
        const [contractAddress, key] = dependentKey.split(':')
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

          return {
            contractAddress,
            [Op.or]: [
              // Where key is one of the non map keys.
              { key: nonMapKeys },
              // Or where key is prefixed by one of the map prefixes.
              {
                key: {
                  [Op.or]: mapPrefixes.map((prefix) => ({
                    [Op.like]: `${prefix}%`,
                  })),
                },
              },
            ],
          }
        }
      ),
    }
  }

  get block(): Block {
    return {
      height: this.blockHeight,
      timeUnixMs: this.blockTimeUnixMs,
    }
  }
}
