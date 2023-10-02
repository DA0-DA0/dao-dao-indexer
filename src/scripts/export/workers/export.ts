import retry from 'async-await-retry'

import { QueueName } from '@/core/types'

import { handlerMakers } from '../handlers'
import { ExportQueueData, ExportWorkerMaker } from '../types'
import { getCosmWasmClient } from '../utils'

export const makeExportWorker: ExportWorkerMaker<{
  data: ExportQueueData[]
}> = async (options) => {
  const cosmWasmClient = await getCosmWasmClient(options.config.rpc)

  // Set up handlers.
  const handlers = await Promise.all(
    Object.entries(handlerMakers).map(async ([name, handlerMaker]) => ({
      name,
      handler: await handlerMaker({
        ...options,
        cosmWasmClient,
      }),
    }))
  )

  return {
    queueName: QueueName.Export,
    processor: async ({ data: { data } }) => {
      // Group data by handler.
      const groupedData = data.reduce(
        (acc, { handler, data }) => ({
          ...acc,
          [handler]: (acc[handler] || []).concat(data),
        }),
        {} as Record<string, any[]>
      )

      // Process data.
      for (const { name, handler } of handlers) {
        const events = groupedData[name]
        if (!events?.length) {
          continue
        }

        // Retry 3 times with exponential backoff starting at 100ms delay.
        await retry(handler.process, [events], {
          retriesMax: 3,
          exponential: true,
          interval: 100,
        })
      }
    },
  }
}
