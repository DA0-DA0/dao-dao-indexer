import { createHash, randomUUID } from 'crypto'

import { Op, Sequelize } from 'sequelize'
import {
  AllowNull,
  Column,
  DataType,
  Default,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript'

import { AccountCredit, AccountCreditScope } from './AccountCredit'

@Table({
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['address', 'name'],
    },
    {
      fields: ['hashedKey'],
    },
  ],
})
export class Account extends Model {
  @AllowNull(false)
  @Column
  address!: string

  @AllowNull(false)
  @Column
  name!: string

  @AllowNull
  @Column(DataType.TEXT)
  description!: string | null

  @AllowNull(false)
  @Column
  hashedKey!: string

  @AllowNull(false)
  @Default(0)
  @Column
  nonce!: number

  @HasMany(() => AccountCredit, 'accountId')
  credits!: AccountCredit[]

  public static generateKeyAndHash(): {
    key: string
    hash: string
  } {
    const key = randomUUID()
    const hash = this.hashKey(key)
    return {
      key,
      hash,
    }
  }

  public static hashKey(key: string): string {
    return createHash('sha512').update(key).digest('base64')
  }

  public static async findAccountForKey(key: string): Promise<Account | null> {
    const hashedKey = await this.hashKey(key)
    return await Account.findOne({
      where: {
        hashedKey,
      },
    })
  }

  // Check if this account has credit to compute data for the given scope, and
  // use a credit if found.
  public async useCredit(
    scope: AccountCreditScope,
    amount = 1
  ): Promise<boolean> {
    // Find credit that has enough remaining.
    const credits =
      (await this.$get('credits', {
        where: {
          scopes: {
            [Op.overlap]: [scope, AccountCreditScope.Wildcard],
          },
          amount: {
            [Op.or]: [
              // Infinite credit.
              {
                [Op.eq]: -1,
              },
              // Has enough to cover requested amount.
              {
                [Op.gte]: Sequelize.literal(`"used" + ${amount}`),
              },
            ],
          },
        },
        order: [['createdAt', 'ASC']],
        limit: 1,
      })) ?? ([] as AccountCredit[])

    if (credits.length === 0) {
      return false
    }

    // Use first credit.
    await credits[0].increment('used', { by: amount })

    return true
  }
}
