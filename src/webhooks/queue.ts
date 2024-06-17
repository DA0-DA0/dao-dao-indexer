import { randomUUID } from 'crypto'

import * as Sentry from '@sentry/node'

import { PendingWebhook, getEnv, loadConfig } from '@/core'
import { DependableEventModel, State, WasmStateEvent } from '@/db'
import { WebhooksQueue } from '@/queues/queues/webhooks'

import { getProcessedWebhooks } from './webhooks'

export const queueWebhooks = async (
  events: DependableEventModel[]
): Promise<number> => {
  const state = await State.getSingleton()
  if (!state) {
    return 0
  }

  const webhooks = getProcessedWebhooks(loadConfig(), state)
  if (webhooks.length === 0) {
    return 0
  }

  const pendingWebhooks = (
    await Promise.all(
      events.flatMap((event) => {
        const webhooksForEvent = webhooks.filter((webhook) =>
          webhook.filter(event)
        )

        return webhooksForEvent.map(
          async (webhook): Promise<PendingWebhook | undefined> => {
            const env = getEnv({
              chainId: state.chainId,
              block: event.block,
              cache:
                event instanceof WasmStateEvent
                  ? {
                      contracts: {
                        [event.contract.address]: event.contract,
                      },
                    }
                  : undefined,
            })

            // Wrap in try/catch in case a webhook errors. Don't want to prevent
            // other webhooks from sending.
            let value
            try {
              value = await webhook.getValue(
                event,
                async () => {
                  // Find most recent event for this contract and key before
                  // this block.

                  // Check events in case the most recent event is in the
                  // current group of events.
                  const previousEvent = events
                    .filter(
                      (e) =>
                        e.dependentKey === event.dependentKey &&
                        e.block.height < event.block.height
                    )
                    .slice(-1)[0]

                  if (previousEvent) {
                    return previousEvent
                  }

                  // Fallback to database.
                  return await event.getPreviousEvent()
                },
                env
              )
            } catch (error) {
              console.error(
                `Error getting webhook value for ${event.constructor.name} ID ${event.id} at block ${event.block.height}: ${error}`
              )
              Sentry.captureException(error, {
                tags: {
                  type: 'queue-webhook-value',
                  script: 'export:trace',
                  chainId: state.chainId,
                },
                extra: {
                  eventType: event.constructor.name,
                  event: event.toJSON(),
                },
              })
            }

            // Wrap in try/catch in case a webhook errors. Don't want to prevent
            // other webhooks from sending.
            let endpoint
            try {
              endpoint =
                typeof webhook.endpoint === 'function'
                  ? await webhook.endpoint(event, env)
                  : webhook.endpoint
            } catch (error) {
              console.error(
                `Error getting webhook endpoint for ${event.constructor.name} ID ${event.id} at block ${event.block.height}: ${error}`
              )
              Sentry.captureException(error, {
                tags: {
                  type: 'queue-webhook-endpoint',
                  script: 'export:trace',
                  chainId: state.chainId,
                },
                extra: {
                  eventType: event.constructor.name,
                  event: event.toJSON(),
                },
              })
            }

            // If value or endpoint is undefined, one either errored or the
            // function returned undefined. In either case, don't send a
            // webhook.
            if (value === undefined || endpoint === undefined) {
              return
            }

            return {
              eventType: event.constructor.name,
              eventId: event.id,
              endpoint,
              value,
            }
          }
        )
      })
    )
  ).filter((w): w is PendingWebhook => w !== undefined)

  if (pendingWebhooks.length) {
    await WebhooksQueue.addBulk(
      pendingWebhooks.map((data) => ({
        name: randomUUID(),
        data,
      }))
    )
  }

  return pendingWebhooks.length
}
