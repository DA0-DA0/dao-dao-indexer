import {
  AllowNull,
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { AccountWebhook } from './AccountWebhook'
import { AccountWebhookEvent } from './AccountWebhookEvent'

export type AccountWebhookEventAttemptApiJson = {
  sentAt: string
  url: string
  requestBody: string
  requestHeaders: string
  responseBody: string | null
  responseHeaders: string | null
  statusCode: number
}

@Table({
  timestamps: true,
})
export class AccountWebhookEventAttempt extends Model {
  @AllowNull(false)
  @ForeignKey(() => AccountWebhookEvent)
  @Column
  webhookEventId!: number

  @BelongsTo(() => AccountWebhook)
  webhook!: AccountWebhook

  @AllowNull(false)
  @Column(DataType.STRING)
  url!: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  requestBody!: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  requestHeaders!: string

  @AllowNull
  @Column(DataType.TEXT)
  responseBody!: string | null

  @AllowNull
  @Column(DataType.TEXT)
  responseHeaders!: string | null

  @AllowNull(false)
  @Column(DataType.INTEGER)
  statusCode!: number

  @CreatedAt
  createdAt!: Date

  get apiJson(): AccountWebhookEventAttemptApiJson {
    return {
      sentAt: this.createdAt.toISOString(),
      url: this.url,
      requestBody: this.requestBody,
      requestHeaders: this.requestHeaders,
      responseBody: this.responseBody,
      responseHeaders: this.responseHeaders,
      statusCode: this.statusCode,
    }
  }
}
