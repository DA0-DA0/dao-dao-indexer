import { randomUUID } from 'crypto'

import * as Sentry from '@sentry/node'

import {
  ContractEnv,
  PendingWebhook,
  QueueName,
  getBullQueue,
  getEnv,
  loadConfig,
} from '@/core'
import { getProcessedWebhooks } from '@/data/webhooks'
import { State, WasmStateEvent } from '@/db'

export const queueWebhooks = async (
  state: State,
  wasmEvents: WasmStateEvent[]
): Promise<void> => {
  const webhooks = getProcessedWebhooks(loadConfig(), state)
  if (webhooks.length === 0) {
    return
  }

  const pendingWebhooks = (
    await Promise.all(
      wasmEvents.flatMap((wasmEvent) => {
        const webhooksForEvent = webhooks.filter((webhook) =>
          webhook.filter(wasmEvent)
        )

        return webhooksForEvent.map(
          async (webhook): Promise<PendingWebhook | undefined> => {
            const env: ContractEnv = {
              ...getEnv({
                chainId: state.chainId,
                block: wasmEvent.block,
                cache: {
                  contracts: {
                    [wasmEvent.contract.address]: wasmEvent.contract,
                  },
                },
              }),
              contractAddress: wasmEvent.contractAddress,
            }

            // Wrap in try/catch in case a webhook errors. Don't want to prevent
            // other webhooks from sending.
            let value
            try {
              value = await webhook.getValue(
                wasmEvent,
                async () => {
                  // Find most recent event for this contract and key before
                  // this block.

                  // Check events in case the most recent event is in the
                  // current group of events.
                  const previousEvent = wasmEvents
                    .filter(
                      (e) =>
                        e.contractAddress === wasmEvent.contractAddress &&
                        e.key === e.key &&
                        e.blockHeight < wasmEvent.blockHeight
                    )
                    .slice(-1)[0]

                  if (previousEvent) {
                    return previousEvent.delete ? null : previousEvent.valueJson
                  }

                  // Fallback to database.
                  const lastEvent = await wasmEvent.getPreviousEvent()
                  return !lastEvent || lastEvent.delete
                    ? null
                    : lastEvent.valueJson
                },
                env
              )
            } catch (error) {
              console.error(
                `Error getting webhook value for event ${wasmEvent.blockHeight}/${wasmEvent.contractAddress}/${wasmEvent.key}: ${error}`
              )
              Sentry.captureException(error, {
                tags: {
                  type: 'queue-webhook-value',
                  script: 'export:trace',
                  chainId: state.chainId,
                },
                extra: {
                  wasmEvent,
                },
              })
            }

            // Wrap in try/catch in case a webhook errors. Don't want to prevent
            // other webhooks from sending.
            let endpoint
            try {
              endpoint =
                typeof webhook.endpoint === 'function'
                  ? await webhook.endpoint(wasmEvent, env)
                  : webhook.endpoint
            } catch (error) {
              console.error(
                `Error getting webhook endpoint for event ${wasmEvent.blockHeight}/${wasmEvent.contractAddress}/${wasmEvent.key}: ${error}`
              )
              Sentry.captureException(error, {
                tags: {
                  type: 'queue-webhook-endpoint',
                  script: 'export:trace',
                  chainId: state.chainId,
                },
                extra: {
                  wasmEvent,
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
              wasmEventId: wasmEvent.id,
              endpoint,
              value,
            }
          }
        )
      })
    )
  ).filter((w): w is PendingWebhook => w !== undefined)

  if (pendingWebhooks.length) {
    const webhookQueue = getBullQueue<PendingWebhook>(QueueName.Webhooks)

    webhookQueue.on('error', async (err) => {
      console.error('Webhook queue errored', err)

      Sentry.captureException(err, {
        tags: {
          type: 'webhook-queue-error',
          script: 'export:trace',
          chainId: state.chainId,
        },
        extra: {
          pendingWebhooks,
        },
      })
    })

    webhookQueue.addBulk(
      pendingWebhooks.map((data) => ({
        name: randomUUID(),
        data,
      }))
    )
  }
}
