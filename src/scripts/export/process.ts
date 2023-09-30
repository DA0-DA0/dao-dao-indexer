import * as Sentry from '@sentry/node'
import retry from 'async-await-retry'
import { Worker } from 'bullmq'
import { Command } from 'commander'

import { DbType, EXPORT_QUEUE_NAME, getBullWorker, loadConfig } from '@/core'
import { State, loadDb } from '@/db'

import { handlerMakers } from './handlers'
import { ExportQueueData } from './types'
import { getCosmWasmClient } from './utils'

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.option(
  // Adds inverted `update` boolean to the options object.
  '--no-update',
  "don't update computation validity based on new events or transformations"
)
program.option(
  // Adds inverted `webhooks` boolean to the options object.
  '--no-webhooks',
  "don't send webhooks"
)
program.parse()
const { config: _config, update, webhooks } = program.opts()

// Load config with config option.
const config = loadConfig(_config)

// Add Sentry error reporting.
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
  })
}

const main = async () => {
  // Load DB on start.
  const dataSequelize = await loadDb({
    type: DbType.Data,
  })
  const accountsSequelize = await loadDb({
    type: DbType.Accounts,
  })

  // Initialize state.
  await State.createSingletonIfMissing()

  const cosmWasmClient = await getCosmWasmClient(config.rpc)

  // Setup handlers.
  const handlers = await Promise.all(
    Object.entries(handlerMakers).map(async ([name, handlerMaker]) => ({
      name,
      handler: await handlerMaker({
        config,
        updateComputations: !!update,
        sendWebhooks: !!webhooks,
        cosmWasmClient,
      }),
    }))
  )

  // Create queue worker.
  const worker = getBullWorker<{ data: ExportQueueData[] }>(
    EXPORT_QUEUE_NAME,
    async (job) => {
      const { data } = job.data

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

        try {
          // Retry 3 times with exponential backoff starting at 100ms delay.
          await retry(handler.process, [events], {
            retriesMax: 3,
            exponential: true,
            interval: 100,
          })
        } catch (err) {
          console.error(
            '-------\nFailed to process:\n',
            err instanceof Error ? err.message : err,
            '\n-------'
          )
          Sentry.captureException(err, {
            tags: {
              type: 'failed-flush',
              script: 'export',
            },
            extra: {
              handler: name,
            },
          })

          throw err
        }
      }
    }
  )

  // Add shutdown signal handler.
  process.on('SIGINT', () => {
    if (worker.closing) {
      console.log('Already shutting down.')
    } else {
      console.log('Shutting down after worker jobs finish...')
      // Exit once worker closes.
      worker.close().then(async () => {
        await dataSequelize.close()
        await accountsSequelize.close()
        process.exit(0)
      })
    }
  })

  // Tell pm2 we're ready.
  if (process.send) {
    process.send('ready')
  }
}

main().catch((err) => {
  console.error('Processor errored', err)
  process.exit(1)
})
