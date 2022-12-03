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
  validate: {
    valueIsNullIffDelete() {
      if (this.delete && this.value !== null) {
        throw new Error('value must be null when delete is true')
      }
      if (!this.delete && this.value === null) {
        throw new Error('value must not be null when delete is false')
      }
    },
  },
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
  blockTimeUnixMs: bigint

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
