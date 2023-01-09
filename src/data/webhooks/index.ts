import { Config, ProcessedWebhook, Webhook } from '@/core'
import { State } from '@/db'

import { makeProposalCreated } from './discordNotifier'

let processedWebhooks: ProcessedWebhook[] | undefined
export const getProcessedWebhooks = (
  config: Config,
  state: State
): ProcessedWebhook[] => {
  if (!processedWebhooks) {
    // Add webhooks here.
    const _webhooks: Webhook[] = [makeProposalCreated(config, state)]

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
