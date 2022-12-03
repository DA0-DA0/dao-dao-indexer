import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { Contract } from './Contract'

@Table({
  timestamps: true,
  indexes: [
    // Only one event can happen to a key for a given contract at a given block
    // height. This ensures events are not duplicated if they attempt exporting
    // multiple times.
    {
      unique: true,
      fields: ['contractAddress', 'blockHeight', 'key'],
    },
  ],
})
export class Event extends Model {
  @AllowNull(false)
  @ForeignKey(() => Contract)
  @Column
  contractAddress: string

  @BelongsTo(() => Contract)
  contract: Contract

  @AllowNull(false)
  @Column
  blockHeight: bigint

  @AllowNull(false)
  @Column
  blockTimeUnixMicro: bigint

  @AllowNull(false)
  @Column(DataType.TEXT)
  key: string

  @AllowNull
  @Column(DataType.TEXT)
  value: string

  @AllowNull(false)
  @Column
  delete: boolean
}
