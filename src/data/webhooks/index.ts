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
            match &&= filter.matches(event)
          }

          return match
        },
      }
    })
  }

  return processedWebhooks
}
