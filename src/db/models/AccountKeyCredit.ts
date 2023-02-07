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

export type AccountKeyCreditApiJson = {
  paymentSource: AccountKeyCreditPaymentSource
  paymentId: string
  paidFor: boolean
  paidAt: string | null
  amount: string // serialized bigint
  used: string // serialized bigint
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

  // Postgres integer type is 32-bit, which has a max of 2147483648, so use
  // bigint which is 64-bit instead.

  // Total number of credits allowed.
  @AllowNull(false)
  @Default(0n)
  @Column
  amount!: bigint

  // Total number of credits used.
  @AllowNull(false)
  @Default(0n)
  @Column
  used!: bigint

  // Total number of times this credit has been used.
  @AllowNull(false)
  @Default(0n)
  @Column
  hits!: bigint

  get paidFor(): boolean {
    return this.paidAt !== null
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

  get apiJson(): AccountKeyCreditApiJson {
    return {
      paymentSource: this.paymentSource,
      paymentId: this.paymentId,
      paidFor: this.paidFor,
      paidAt: this.paidAt?.toISOString() || null,
      amount: this.amount.toString(),
      used: this.used.toString(),
    }
  }

  // Compute the number of credits needed to query a range of blocks.
  public static creditsForBlockRange(blocks: number): number {
    // Use 1 credit for the query, and 1 credit for every 10,000 blocks.
    // Querying 1 block uses 1 credit, 2-10,000 blocks uses 2 credits,
    // 10,001-20,000 uses 3, etc.
    return 1 + Math.ceil(blocks / 10000)
  }
}
