import * as Sentry from '@sentry/node'
import { Command } from 'commander'

import { loadConfig } from '@/core/config'
import { DbType } from '@/core/types'
import {
  AccountWebhookEvent,
  AccountWebhookEventAttempt,
  AccountWebhookEventStatus,
  loadDb,
} from '@/db'

const LOADER_MAP = ['—', '\\', '|', '/']

let shuttingDown = false
let logInterval: NodeJS.Timeout

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.option(
  '-b, --batch <size>',
  'webhook batch size',
  (value) => parseInt(value, 10),
  50
)
program.parse()
const { config: _config, batch } = program.opts()

const config = loadConfig(_config)

// Add Sentry error reporting.
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
  })
}

const main = async () => {
  // Connect to accounts DB.
  await loadDb({
    type: DbType.Accounts,
  })

  console.log(`\n\n[${new Date().toISOString()}] Firing webhooks...`)

  // Statistics.
  let printLoaderCount = 0
  let succeeded = 0
  let failed = 0
  const printStatistics = () => {
    printLoaderCount = (printLoaderCount + 1) % LOADER_MAP.length
    process.stdout.write(
      `\r${
        LOADER_MAP[printLoaderCount]
      }  Succeeded: ${succeeded.toLocaleString()}. Failed: ${failed.toLocaleString()}.`
    )
  }

  // Print latest statistics every 100ms.
  logInterval = setInterval(printStatistics, 100)
  // Allow process to exit even though this interval is alive.
  logInterval.unref()

  while (!shuttingDown) {
    const pending = await AccountWebhookEvent.findAll({
      where: {
        status: [
          AccountWebhookEventStatus.Pending,
          AccountWebhookEventStatus.Retrying,
        ],
      },
      limit: batch,
      include: AccountWebhookEventAttempt,
    })

    const firings = await Promise.all(
      pending.map(async (pendingWebhook) => {
        try {
          return await pendingWebhook.fire()
        } catch (err) {
          // Capture errored fire calls. This shouldn't happen unless the
          // database is having issues, since the actual webhook firing error is
          // caught and stored.
          Sentry.captureException(err, {
            tags: {
              type: 'webhook_uncaught',
              accountWebhookEventId: pendingWebhook.id,
              uuid: pendingWebhook.uuid,
              url: pendingWebhook.url,
            },
          })
          return false
        }
      })
    )

    succeeded += firings.filter((request) => request).length
    failed += firings.filter((request) => !request).length

    // If no webhooks or all failed, wait between loops to prevent spamming.
    if (succeeded === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  printStatistics()
  console.log()

  process.exit(0)
}

main()

process.on('SIGINT', () => {
  shuttingDown = true
  clearInterval(logInterval)
  console.log('\nShutting down after current batch finishes...')
})
