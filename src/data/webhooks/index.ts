import { Config, ProcessedWebhook, Webhook } from '@/core'

// Add webhooks here.
const _webhooks: Webhook[] = []

let processedWebhooks: ProcessedWebhook[] | undefined
export const getProcessedWebhooks = ({
  codeIds,
}: Config): ProcessedWebhook[] => {
  if (!processedWebhooks) {
    processedWebhooks = _webhooks.map(({ filter, ...webhook }) => {
      const allCodeIds = filter.codeIdsKeys?.flatMap(
        (key) => codeIds?.[key] ?? []
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
