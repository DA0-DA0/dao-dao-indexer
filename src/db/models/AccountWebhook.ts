import {
  AllowNull,
  BelongsTo,
  BelongsToMany,
  Column,
  DataType,
  Default,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript'

import { Account } from './Account'
import { AccountCodeIdSet } from './AccountCodeIdSet'
import { AccountWebhookAttempt } from './AccountWebhookAttempt'
import { AccountWebhookCodeIdSet } from './AccountWebhookCodeIdSet'

export type AccountWebhookApiJson = {
  description: string | null
  url: string
  secret: string
  onlyFirstSet: boolean
  contractAddresses: string[]
  codeIdSetIds: number[]
  stateKey: string | null
  stateKeyIsPrefix: boolean | null
}

@Table({
  timestamps: true,
})
export class AccountWebhook extends Model {
  @AllowNull(false)
  @ForeignKey(() => Account)
  @Column
  accountPublicKey!: string

  @BelongsTo(() => Account)
  account!: Account

  @AllowNull
  @Column(DataType.STRING)
  description!: string | null

  @AllowNull(false)
  @Column(DataType.STRING)
  url!: string

  @AllowNull(false)
  @Column(DataType.STRING)
  secret!: string

  // Only send the first time this is set.
  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  onlyFirstSet!: boolean

  @AllowNull
  @Column(DataType.ARRAY(DataType.STRING))
  contractAddresses!: string[] | null

  @BelongsToMany(() => AccountCodeIdSet, () => AccountWebhookCodeIdSet)
  codeIdSets!: AccountCodeIdSet[]

  @AllowNull
  @Column(DataType.STRING)
  stateKey!: string | null

  // If true, the state key is a prefix. If false, the state key is exact.
  @AllowNull
  @Column(DataType.BOOLEAN)
  stateKeyIsPrefix!: boolean | null

  @HasMany(() => AccountWebhookAttempt, 'webhookId')
  attempts!: AccountWebhookAttempt[]

  public async getApiJson(): Promise<AccountWebhookApiJson> {
    this.codeIdSets = (await this.$get('codeIdSets')) || []

    return {
      description: this.description,
      url: this.url,
      secret: this.secret,
      onlyFirstSet: this.onlyFirstSet,
      contractAddresses: this.contractAddresses || [],
      codeIdSetIds: this.codeIdSets.map((codeIdSet) => codeIdSet.id),
      stateKey: this.stateKey,
      stateKeyIsPrefix: this.stateKeyIsPrefix,
    }
  }
}
