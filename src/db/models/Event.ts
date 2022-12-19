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
      // Speeds up queries.
      fields: ['blockHeight', 'contractAddress'],
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

  get block(): Block {
    return {
      height: this.blockHeight,
      timeUnixMs: this.blockTimeUnixMs,
    }
  }
}
