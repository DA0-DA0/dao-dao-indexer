import { randomUUID } from 'crypto'

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

import { dbKeyForKeys } from '@/core/utils'

import { Account } from './Account'
import { AccountCodeIdSet } from './AccountCodeIdSet'
import { AccountKey } from './AccountKey'
import { AccountKeyCredit } from './AccountKeyCredit'
import { AccountWebhookCodeIdSet } from './AccountWebhookCodeIdSet'
import { AccountWebhookEvent } from './AccountWebhookEvent'
import { WasmStateEvent } from './WasmStateEvent'

export type AccountWebhookApiJson = {
  id: number
  accountKeyId: number | null
  description: string | null
  url: string
  secret: string
  onlyFirstSet: boolean
  contractAddresses: string[]
  codeIdSetIds: number[]
  stateKey: string | null
  stateKeyType: string | null
}

export enum AccountWebhookStateKeyType {
  Item = 'item',
  Map = 'map',
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
  @ForeignKey(() => AccountKey)
  @Column
  accountKeyId!: number

  @BelongsTo(() => AccountKey)
  accountKey!: AccountKey | null

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

  @AllowNull
  @Column(DataType.STRING)
  stateKeyType!: string | null

  @HasMany(() => AccountWebhookEvent, 'webhookId')
  events!: AccountWebhookEvent[]

  async getApiJson(): Promise<AccountWebhookApiJson> {
    this.codeIdSets = (await this.$get('codeIdSets')) || []

    return {
      id: this.id,
      accountKeyId: this.accountKeyId,
      description: this.description,
      url: this.url,
      secret: this.secret,
      onlyFirstSet: this.onlyFirstSet,
      contractAddresses: this.contractAddresses || [],
      codeIdSetIds: this.codeIdSets.map((codeIdSet) => codeIdSet.id),
      stateKey: this.stateKey,
      stateKeyType: this.stateKeyType,
    }
  }

  stateKeyMatches(eventKey: string): boolean {
    if (!this.stateKey) {
      return true
    }

    switch (this.stateKeyType) {
      case AccountWebhookStateKeyType.Item:
        return eventKey === dbKeyForKeys(this.stateKey)

      case AccountWebhookStateKeyType.Map:
        return eventKey.startsWith(dbKeyForKeys(this.stateKey, ''))

      default:
        return false
    }
  }

  // Check if a webhook matches an event.
  async matches(event: WasmStateEvent): Promise<boolean> {
    // Load event contract if necessary.
    event.contract ||= (await event.$get('contract'))!
    if (!event.contract) {
      throw new Error('Event contract not loaded')
    }

    // Load code ID sets if necessary.
    this.codeIdSets ||= (await this.$get('codeIdSets')) || []

    // Check if the event matches the webhook.
    return (
      (this.contractAddresses === null ||
        this.contractAddresses.includes(event.contractAddress)) &&
      (this.codeIdSets.length === 0 ||
        this.codeIdSets.some(({ codeIds }) =>
          codeIds.includes(event.contract.codeId)
        )) &&
      this.stateKeyMatches(event.key) &&
      (!this.onlyFirstSet || !(await event.getPreviousEvent()))
    )
  }

  // Queue webhook for an event.
  async queue(event: WasmStateEvent) {
    // Load account key if necessary.
    this.accountKey ||= await this.$get('accountKey')
    // If no key is set, cannot pay for webhook.
    if (!this.accountKey) {
      return
    }

    // Load event contract (asParsedEvent will throw err if load fails).
    event.contract ||= (await event.$get('contract'))!

    // Use account key to pay for webhook. If no credit, do not queue.
    if (
      !(await this.accountKey.useCredit(AccountKeyCredit.creditsForWebhook))
    ) {
      return
    }

    return await this.$create<AccountWebhookEvent>('event', {
      uuid: randomUUID(),
      url: this.url,
      parsedEvent: event.asParsedEvent,
    })
  }

  // Queue webhooks for events. Events must be loaded with `Contract` included.
  static async queueWebhooks(events: WasmStateEvent[]): Promise<number> {
    const webhooks = await AccountWebhook.findAll({
      include: [
        {
          model: AccountKey,
          // If no key is set, cannot pay for webhook.
          required: true,
        },
        {
          model: AccountCodeIdSet,
        },
      ],
    })

    const matches = await Promise.all(
      webhooks.flatMap((webhook) =>
        events.map(async (event) => ({
          webhook,
          event,
          matches: await webhook.matches(event),
        }))
      )
    )

    return (
      await Promise.all(
        matches
          .filter(({ matches }) => matches)
          .map(({ webhook, event }) => webhook.queue(event))
      )
    ).length
  }
}
