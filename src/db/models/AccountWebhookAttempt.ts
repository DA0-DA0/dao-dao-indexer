import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { AccountWebhook } from './AccountWebhook'

export type AccountWebhookAttemptApiJson = {
  url: string
  requestBody: string
  requestHeaders: string
  responseBody: string
  responseHeaders: string
  statusCode: number
  statusMessage: string
}

@Table({
  timestamps: true,
})
export class AccountWebhookAttempt extends Model {
  @AllowNull(false)
  @ForeignKey(() => AccountWebhook)
  @Column
  webhookId!: number

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

  @AllowNull(false)
  @Column(DataType.TEXT)
  responseBody!: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  responseHeaders!: string

  @AllowNull(false)
  @Column(DataType.INTEGER)
  statusCode!: number

  @AllowNull(false)
  @Column(DataType.TEXT)
  statusMessage!: string

  public async getApiJson(): Promise<AccountWebhookAttemptApiJson> {
    return {
      url: this.url,
      requestBody: this.requestBody,
      requestHeaders: this.requestHeaders,
      responseBody: this.responseBody,
      responseHeaders: this.responseHeaders,
      statusCode: this.statusCode,
      statusMessage: this.statusMessage,
    }
  }
}
