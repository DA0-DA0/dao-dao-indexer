import { Config, ProcessedWebhook, Webhook, WebhookMaker } from '@/core'
import { State } from '@/db'

import { makeProposalCreated } from './discordNotifier'
import { makeAddPendingFollow } from './following'

let processedWebhooks: ProcessedWebhook[] | undefined
export const getProcessedWebhooks = (
  config: Config,
  state: State
): ProcessedWebhook[] => {
  if (!processedWebhooks) {
    const webhookMakers: WebhookMaker[] = [
      // Add webhook makers here.
      makeProposalCreated,
      makeAddPendingFollow,
    ]

    const _webhooks: Webhook[] = [
      // Add webhooks here.

      // Makers.
      ...webhookMakers.map((maker) => maker(config, state)),
    ]

    processedWebhooks = _webhooks.map(({ filter, ...webhook }) => {
      const allCodeIds = filter.codeIdsKeys?.flatMap(
        (key) => config.codeIds?.[key] ?? []
      )

      return {
        ...webhook,
        filter: (event) => {
          let match = true

          if (allCodeIds?.length) {
            match &&= allCodeIds.includes(event.contract.codeId)
          }

          if (match && filter.contractAddresses?.length) {
            match &&= filter.contractAddresses.includes(event.contractAddress)
          }

          if (match && filter.matches) {
            // Wrap in try/catch in case a webhook errors. Don't want to prevent
            // other webhooks from sending.
            try {
              match &&= filter.matches(event)
            } catch (error) {
              // TODO: Store somewhere.
              console.error(
                `Error matching webhook for event ${event.blockHeight}/${event.contractAddress}/${event.key}: ${error}`
              )

              // On error, do not match.
              match = false
            }
          }

          return match
        },
      }
    })
  }

  return processedWebhooks
}
