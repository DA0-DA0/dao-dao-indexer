import { randomUUID } from 'crypto'

import jwt from 'jsonwebtoken'
import {
  AllowNull,
  Column,
  DataType,
  Default,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

import { loadConfig } from '@/core/config'

import { AccountCodeIdSet } from './AccountCodeIdSet'
import { AccountKey } from './AccountKey'
import {
  AccountKeyCredit,
  AccountKeyCreditPaymentSource,
} from './AccountKeyCredit'
import { AccountWebhook } from './AccountWebhook'

// Stores the nonce for each public key, which is used to prevent replay
// attacks of past authenticated messages.
@Table({
  timestamps: true,
})
export class Account extends Model {
  @PrimaryKey
  @Column
  publicKey!: string

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  nonce!: number

  @HasMany(() => AccountKey, 'accountPublicKey')
  keys!: AccountKey[]

  @HasMany(() => AccountWebhook, 'accountPublicKey')
  webhooks!: AccountWebhook[]

  @HasMany(() => AccountCodeIdSet, 'accountPublicKey')
  codeIdSets!: AccountCodeIdSet[]

  // Generates a random API key and creates a key on this account with it. Also
  // setup one credit for the key to accept payment.
  public async generateKey({
    name,
    description,
  }: Pick<AccountKey, 'name' | 'description'>) {
    // Generate key with hash, and create AccountKey.
    const { key: apiKey, hash: hashedKey } = AccountKey.generateKeyAndHash()

    const accountKey = await this.$create<AccountKey>('key', {
      name,
      description,
      hashedKey,
    })

    await accountKey.$create<AccountKeyCredit>('credit', {
      paymentSource: AccountKeyCreditPaymentSource.CwReceipt,
      paymentId: randomUUID(),
    })

    return {
      apiKey,
      accountKey,
    }
  }

  // Get JWT token for login. Expires in 30 days.
  public getAuthToken() {
    const { accountsJwtSecret } = loadConfig()
    if (!accountsJwtSecret) {
      throw new Error('JWT not configured.')
    }

    return jwt.sign(
      {
        publicKey: this.publicKey,
      },
      accountsJwtSecret,
      {
        expiresIn: '30d',
      }
    )
  }
}
