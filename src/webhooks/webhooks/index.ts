import * as Sentry from '@sentry/node'

import { State, WasmStateEvent } from '@/db'
import { WasmCodeService } from '@/services/wasm-codes'
import { Config, ProcessedWebhook, Webhook, WebhookMaker } from '@/types'

import * as discord from './discord'
import * as indexerCwReceipt from './indexerCwReceipt'
import * as notify from './notify'
import * as telegram from './telegram'
import * as websockets from './websockets'

let processedWebhooks: ProcessedWebhook<any, any>[] | undefined

export const getProcessedWebhooks = (
  config: Config,
  state: State
): ProcessedWebhook[] => {
  if (!processedWebhooks) {
    const webhookMakers: WebhookMaker<any, any>[] = [
      // Add webhook makers here.
      ...Object.values(discord),
      ...Object.values(telegram),
      ...Object.values(indexerCwReceipt),
      ...Object.values(notify),
      ...Object.values(websockets),
    ]

    const _webhooks: Webhook[] = [
      // Add webhooks here.

      // Makers.
      ...webhookMakers.map((maker) => maker(config, state)),
    ]
      // Filter out webhooks that could not be made (e.g. due to missing
      // config).
      .filter((webhook): webhook is Webhook => !!webhook)

    processedWebhooks = _webhooks.map(({ filter, ...webhook }) => ({
      ...webhook,
      filter: (event, env) => {
        // Filter for event type. This is necessary since the rest of the
        // webhook's functions expect to receive the correct type.
        if (!(event instanceof filter.EventType)) {
          return false
        }

        // Filters specific to WasmStateEvent types.
        if (event instanceof WasmStateEvent) {
          const allCodeIds =
            WasmCodeService.getInstance().findWasmCodeIdsByKeys(
              ...(filter.codeIdsKeys ?? [])
            )

          if (
            allCodeIds?.length &&
            !allCodeIds.includes(event.contract.codeId)
          ) {
            return false
          }

          if (
            filter.contractAddresses?.length &&
            !filter.contractAddresses.includes(event.contractAddress)
          ) {
            return false
          }
        }

        if (filter.matches) {
          // Wrap in try/catch in case a webhook errors. Don't want to prevent
          // other webhooks from sending.
          try {
            return filter.matches(event, env)
          } catch (error) {
            console.error(
              `Error matching webhook for ${event.constructor.name} ID ${event.id} at height ${event.block.height}: ${error}`
            )
            Sentry.captureException(error, {
              tags: {
                type: 'failed-webhook-match',
              },
              extra: {
                event,
              },
            })

            // On error, do not match.
            return false
          }
        }

        return true
      },
    }))
  }

  return processedWebhooks
}
