import { Worker } from 'worker_threads'

import axios from 'axios'
import { Op } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'

import { WebhookEndpoint, getEnv, loadConfig } from '@/core'
import { getProcessedWebhooks } from '@/data/webhooks'

import { Event } from './Event'
import { State } from './State'

@Table({
  timestamps: true,
})
export class PendingWebhook extends Model {
  @AllowNull(false)
  @ForeignKey(() => Event)
  @Column
  eventId!: number

  @BelongsTo(() => Event)
  event!: Event

  @AllowNull(false)
  @Column(DataType.JSONB)
  endpoint!: WebhookEndpoint

  @AllowNull(false)
  @Column(DataType.JSONB)
  value!: any

  @AllowNull(false)
  @Column(DataType.INTEGER)
  failures!: number

  // Events must be loaded with `Contract` included.
  static async queueWebhooks(state: State, events: Event[]): Promise<number> {
    const webhooks = getProcessedWebhooks(loadConfig(), state)
    if (webhooks.length === 0) {
      return 0
    }

    const pendingWebhooksToCreate = (
      await Promise.all(
        events.flatMap((event) => {
          const webhooksForEvent = webhooks.filter((webhook) =>
            webhook.filter(event)
          )

          return webhooksForEvent.map(async (webhook) => {
            const value = await webhook.getValue(
              event,
              async () => {
                // Find most recent event for this contract and key before this
                // block.

                // Check events in case the most recent event is in the current
                // group of events.
                const previousEvent = events
                  .filter(
                    (e) =>
                      e.contractAddress === event.contractAddress &&
                      e.key === e.key &&
                      e.blockHeight < event.blockHeight
                  )
                  .slice(-1)[0]

                if (previousEvent) {
                  return previousEvent.valueJson
                }

                // Fallback to database.
                return (
                  (
                    await Event.findOne({
                      where: {
                        contractAddress: event.contractAddress,
                        key: event.key,
                        blockHeight: {
                          [Op.lt]: event.blockHeight,
                        },
                      },
                      order: [['blockHeight', 'DESC']],
                    })
                  )?.valueJson ?? null
                )
              },
              {
                ...getEnv({ block: event.block }),
                contractAddress: event.contractAddress,
              }
            )

            if (value === undefined) {
              return
            }

            return {
              eventId: event.id,
              endpoint:
                typeof webhook.endpoint === 'function'
                  ? webhook.endpoint(event)
                  : webhook.endpoint,
              value,
              failures: 0,
            }
          })
        })
      )
    ).filter(
      (
        w
      ): w is {
        eventId: number
        endpoint: WebhookEndpoint
        value: any
        failures: number
      } => w !== undefined
    )

    if (!pendingWebhooksToCreate.length) {
      return 0
    }

    return (await PendingWebhook.bulkCreate(pendingWebhooksToCreate)).length
  }

  async fire() {
    try {
      await axios(this.endpoint.url, {
        method: this.endpoint.method,
        // https://stackoverflow.com/a/74735197
        headers: { 'Accept-Encoding': 'gzip,deflate,compress' },
        data: this.value,
      })

      // Delete the pending webhook if request was successful.
      await this.destroy()
    } catch (err) {
      this.failures++
      await this.save()
      throw err
    }
  }
}
