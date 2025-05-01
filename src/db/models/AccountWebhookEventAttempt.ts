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
  @Column(DataType.INTEGER)
  declare webhookEventId: number

  @BelongsTo(() => AccountWebhookEvent)
  declare webhookEvent: AccountWebhookEvent

  @AllowNull(false)
  @Column(DataType.STRING)
  declare url: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare requestBody: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare requestHeaders: string

  @AllowNull
  @Column(DataType.TEXT)
  declare responseBody: string | null

  @AllowNull
  @Column(DataType.TEXT)
  declare responseHeaders: string | null

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare statusCode: number

  @CreatedAt
  declare createdAt: Date

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

  get success(): boolean {
    return this.statusCode >= 200 && this.statusCode < 300
  }
}
