import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { Account } from './Account'

export enum AccountCreditScope {
  // Can compute data for the latest block.
  Latest = 'latest',
  // Can compute data for historical blocks.
  Historical = 'historical',
  // Can compute data for a range of blocks.
  Range = 'range',
  // Wildcard. Can do anything.
  Wildcard = '*',
}

@Table({
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['transactionHash'],
    },
    {
      fields: ['amount'],
    },
    {
      fields: ['scopes'],
    },
  ],
})
export class AccountCredit extends Model {
  @AllowNull(false)
  @ForeignKey(() => Account)
  @Column
  accountAddress!: string

  @BelongsTo(() => Account)
  account!: Account

  @AllowNull(false)
  @Column
  transactionHash!: string

  @AllowNull(false)
  @Column
  amount!: bigint

  @AllowNull(false)
  @Default(0)
  @Column
  used!: bigint

  @AllowNull(false)
  @Column(DataType.ARRAY(DataType.STRING))
  scopes!: AccountCreditScope[]
}
