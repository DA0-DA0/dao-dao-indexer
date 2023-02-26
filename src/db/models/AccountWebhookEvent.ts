import { createHmac } from 'crypto'

import * as Sentry from '@sentry/node'
import axios, { AxiosError } from 'axios'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  HasMany,
  Model,
  Table,
  Unique,
} from 'sequelize-typescript'

import { ParsedEvent, SerializedBlock } from '@/core/types'

import { AccountWebhook } from './AccountWebhook'
import {
  AccountWebhookEventAttempt,
  AccountWebhookEventAttemptApiJson,
} from './AccountWebhookEventAttempt'

export type AccountWebhookEventApiJson = {
  uuid: string
  url: string
  attempts: AccountWebhookEventAttemptApiJson[]
}

type RequestBody = {
  uuid: string
  block: SerializedBlock & { timestamp: string }
  contractAddress: string
  codeId: number
  key: string
  value: any | null
  delete: boolean
}

export enum AccountWebhookEventStatus {
  Pending = 'pending',
  Success = 'success',
  Retrying = 'retrying',
  Failure = 'failure',
}

const MAX_ATTEMPTS = 3

@Table({
  timestamps: true,
})
export class AccountWebhookEvent extends Model {
  @AllowNull(false)
  @ForeignKey(() => AccountWebhook)
  @Column
  webhookId!: number

  @BelongsTo(() => AccountWebhook)
  webhook!: AccountWebhook

  @HasMany(() => AccountWebhookEventAttempt, 'webhookEventId')
  attempts!: AccountWebhookEventAttempt[]

  @AllowNull(false)
  @Column(DataType.STRING)
  @Unique
  uuid!: string

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(AccountWebhookEventStatus)))
  @Default(AccountWebhookEventStatus.Pending)
  status!: AccountWebhookEventStatus

  @AllowNull(false)
  @Column(DataType.STRING)
  url!: string

  @AllowNull(false)
  @Column(DataType.JSONB)
  parsedEvent!: ParsedEvent

  async getApiJson(): Promise<AccountWebhookEventApiJson> {
    this.attempts ||= (await this.$get('attempts')) ?? []

    return {
      url: this.url,
      uuid: this.uuid,
      attempts: this.attempts.map((attempt) => attempt.apiJson),
    }
  }

  // Sign request information for webhook verification header.
  async getRequestSignature(
    url: string,
    requestBody: RequestBody
  ): Promise<string> {
    const webhook = this.webhook || (await this.$get('webhook'))
    if (!webhook) {
      throw new Error('Webhook not found')
    }

    // Create string of URL with body keys and values, deterministically.
    const data =
      url +
      Object.keys(requestBody)
        .sort()
        .map((key) => `${key}=${requestBody[key as keyof RequestBody]}`)

    const signature = createHmac('sha256', webhook.secret)
      .update(data)
      .digest('base64')
    return signature
  }

  async fire() {
    // Load attempts.
    this.attempts ||= (await this.$get('attempts')) ?? []

    const requestBody: RequestBody = {
      uuid: this.uuid,
      block: {
        height: this.parsedEvent.blockHeight,
        timeUnixMs: this.parsedEvent.blockTimeUnixMs,
        timestamp: new Date(
          Number(this.parsedEvent.blockTimeUnixMs)
        ).toISOString(),
      },
      contractAddress: this.parsedEvent.contractAddress,
      codeId: this.parsedEvent.codeId,
      key: this.parsedEvent.key,
      value: this.parsedEvent.valueJson,
      delete: this.parsedEvent.delete,
    }
    const requestHeaders = {
      // Sending JSON.
      'Content-Type': 'application/json',
      // axios bug fix: https://stackoverflow.com/a/74735197
      'Accept-Encoding': 'gzip,deflate,compress',
      // Sign request information for webhook verification header.
      'X-Webhook-Signature': await this.getRequestSignature(
        this.url,
        requestBody
      ),
    }

    let responseBody
    let responseHeaders = null
    let statusCode: number
    try {
      const response = await axios(this.url, {
        method: 'POST',
        headers: requestHeaders,
        data: requestBody,
      })

      responseBody = response.data
      responseHeaders = response.headers
      statusCode = response.status
    } catch (err) {
      statusCode = -1

      if (err instanceof AxiosError) {
        if (err.response) {
          responseBody = err.response.data
          responseHeaders = err.response.headers
          statusCode = err.response.status
        } else {
          // If no response, persist error message in response field.
          responseBody = err.message
        }
      }

      // Capture unexpected error.
      Sentry.captureException(err, {
        tags: {
          type: 'webhook',
          accountWebhookEventId: this.id,
          uuid: this.uuid,
          url: this.url,
        },
      })
    }

    // Create attempt.
    await this.$create('attempts', {
      url: this.url,
      requestBody: JSON.stringify(requestBody),
      requestHeaders: JSON.stringify(requestHeaders),
      responseBody: responseBody && JSON.stringify(responseBody),
      responseHeaders: responseHeaders && JSON.stringify(responseHeaders),
      statusCode,
    })

    // Update status if has not yet succeeded or failed.
    if (
      this.status === AccountWebhookEventStatus.Pending ||
      this.status === AccountWebhookEventStatus.Retrying
    ) {
      if (statusCode >= 200 && statusCode < 300) {
        this.status = AccountWebhookEventStatus.Success
      } else {
        this.status =
          this.attempts.length < MAX_ATTEMPTS
            ? AccountWebhookEventStatus.Retrying
            : AccountWebhookEventStatus.Failure
      }

      await this.save()
    }
  }
}
