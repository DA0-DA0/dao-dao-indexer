import { Worker } from 'worker_threads'

import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { Validator } from './Validator'

@Table({
  timestamps: true,
  indexes: [
    // This unique index is used to ensure that we don't duplicate events during
    // export or re-export. I do not think a validator will ever be slashed
    // multiple times for the same infraction and registered at the same block
    // height, so this should be safe.
    // TODO: Check if this is safe.
    {
      unique: true,
      fields: [
        'registeredBlockHeight',
        'infractionBlockHeight',
        'slashFactor',
        'amountSlashed',
      ],
    },
    {
      // Speed up ordering queries.
      fields: ['registeredBlockHeight'],
    },
    {
      // Speed up ordering queries.
      fields: ['registeredBlockTimeUnixMs'],
    },
  ],
})
export class SlashEvent extends Model {
  @AllowNull(false)
  @ForeignKey(() => Validator)
  @Column
  validatorOperatorAddress!: string

  @BelongsTo(() => Validator)
  validator!: Validator

  @AllowNull(false)
  @Column(DataType.BIGINT)
  registeredBlockHeight!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  registeredBlockTimeUnixMs!: string

  @AllowNull(false)
  @Column(DataType.DATE)
  registeredBlockTimestamp!: Date

  @AllowNull(false)
  @Column(DataType.BIGINT)
  infractionBlockHeight!: string

  @AllowNull(false)
  @Column(DataType.STRING)
  slashFactor!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  amountSlashed!: string
}
