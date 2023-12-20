import * as Sentry from '@sentry/node'
import { Command } from 'commander'

import { DbType, getBullWorker, loadConfig } from '@/core'
import { State, loadDb } from '@/db'

import { workerMakers } from './workers'

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

  console.log(
    `\n[${new Date().toISOString()}] Starting background queue workers...`
  )

  // Create queue workers.
  const madeWorkers = await Promise.all(
    workerMakers.map((makeWorker) =>
      makeWorker({
        config,
        updateComputations: !!update,
        sendWebhooks: !!webhooks,
      })
    )
  )

  const workers = madeWorkers.map(({ queueName, processor }) => {
    const worker = getBullWorker(queueName, processor)

    worker.on('error', async (err) => {
      console.error('Worker errored', err)

      Sentry.captureException(err, {
        tags: {
          type: 'worker-error',
          script: 'export:process',
          chainId: (await State.getSingleton())?.chainId ?? 'unknown',
          queueName,
        },
      })
    })

    return worker
  })

  // Add shutdown signal handler.
  process.on('SIGINT', () => {
    if (workers.every((w) => w.closing)) {
      console.log('Already shutting down.')
    } else {
      console.log('Shutting down after current worker jobs complete...')
      // Exit once all workers close.
      Promise.all(workers.map((worker) => worker.close())).then(async () => {
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
