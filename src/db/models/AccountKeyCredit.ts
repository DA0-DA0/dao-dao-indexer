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

import { AccountKey } from './AccountKey'

export enum AccountKeyCreditPaymentSource {
  // cw-receipt contract.
  CwReceipt = 'cw-receipt',
  // Manually credited.
  Manual = 'manual',
}

@Table({
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['paymentSource', 'paymentId'],
    },
    {
      fields: ['amount'],
    },
  ],
})
export class AccountKeyCredit extends Model {
  @AllowNull(false)
  @ForeignKey(() => AccountKey)
  @Column
  accountKeyId!: number

  @BelongsTo(() => AccountKey)
  accountKey!: AccountKey

  @AllowNull(false)
  @Column(DataType.STRING)
  paymentSource!: AccountKeyCreditPaymentSource

  @AllowNull(false)
  @Column(DataType.STRING)
  paymentId!: string

  // Null if not yet paid.
  @AllowNull
  @Column(DataType.DATE)
  paidAt!: Date | null

  // Total number of credits allowed.
  @AllowNull(false)
  @Default(0)
  @Column
  amount!: bigint

  // Total number of credits used.
  @AllowNull(false)
  @Default(0)
  @Column
  used!: bigint

  // Total number of times this credit has been used.
  @AllowNull(false)
  @Default(0)
  @Column
  hits!: bigint

  get paidFor(): boolean {
    return this.paidAt !== null || this.amount > 0
  }

  async registerCreditsPaidFor(
    amount: number | bigint,
    // If true, will update even if already paid for.
    update: boolean
  ): Promise<void> {
    if (this.paidFor && !update) {
      throw new Error('Credit already paid for.')
    }

    await this.update({
      amount: BigInt(amount),
      // Keep original paidAt if already exists (i.e. we're updating).
      paidAt: this.paidAt || new Date(),
    })
  }
}
