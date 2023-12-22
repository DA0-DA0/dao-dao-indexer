import * as Sentry from '@sentry/node'

import { Config, ProcessedWebhook, Webhook, WebhookMaker } from '@/core'
import { State } from '@/db'

import { makeProposalCreated } from './discordNotifier'
import { makeIndexerCwReceiptPaid } from './indexerCwReceipt'
import { makeInboxJoinedDao } from './notify/dao'
import {
  makeInboxPreProposeApprovalProposalCreated,
  makeInboxProposalClosed,
  makeInboxProposalCreated,
  makeInboxProposalExecuted,
} from './notify/proposal'
import { makeBroadcastVoteCast, makeProposalStatusChanged } from './websockets'

let processedWebhooks: ProcessedWebhook[] | undefined
export const getProcessedWebhooks = (
  config: Config,
  state: State
): ProcessedWebhook[] => {
  if (!processedWebhooks) {
    const webhookMakers: WebhookMaker[] = [
      // Add webhook makers here.
      makeProposalCreated,
      makeInboxJoinedDao,
      makeInboxProposalCreated,
      makeInboxProposalExecuted,
      makeInboxProposalClosed,
      makeInboxPreProposeApprovalProposalCreated,
      makeIndexerCwReceiptPaid,
      makeBroadcastVoteCast,
      makeProposalStatusChanged,
    ]

    const _webhooks: Webhook[] = [
      // Add webhooks here.

      // Makers.
      ...webhookMakers.map((maker) => maker(config, state)),
    ]
      // Filter out webhooks that could not be made (e.g. due to missing
      // config).
      .filter((webhook): webhook is Webhook => !!webhook)

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
              console.error(
                `Error matching webhook for event ${event.blockHeight}/${event.contractAddress}/${event.key}: ${error}`
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
