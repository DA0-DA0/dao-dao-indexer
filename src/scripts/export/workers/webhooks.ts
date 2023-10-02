import axios from 'axios'
import Pusher from 'pusher'

import { PendingWebhook, QueueName, WebhookType } from '@/core/types'

import { ExportWorkerMaker } from '../types'

export const makeWebhooksWorker: ExportWorkerMaker<PendingWebhook> = async ({
  config: { soketi },
}) => ({
  queueName: QueueName.Webhooks,
  processor: async ({ data: { endpoint, value } }) => {
    switch (endpoint.type) {
      case WebhookType.Url: {
        await axios(endpoint.url, {
          method: endpoint.method,
          // https://stackoverflow.com/a/74735197
          headers: {
            'Accept-Encoding': 'gzip,deflate,compress',
            ...endpoint.headers,
          },
          data: value,
        })

        break
      }

      case WebhookType.Soketi: {
        if (!soketi) {
          throw new Error('Soketi config not found')
        }

        const pusher = new Pusher(soketi)
        await pusher.trigger(endpoint.channel, endpoint.event, value)

        break
      }

      default:
        throw new Error('Unknown webhook type: ' + (endpoint as any).type)
    }
  },
})
