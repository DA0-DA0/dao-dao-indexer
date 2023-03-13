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

let shuttingDown = false

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

  console.log(
    `\n[accountWebhooks] Firing account webhooks at ${new Date().toISOString()}...`
  )

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

    let succeeded = 0
    if (pending.length > 0) {
      const firings = await Promise.all(
        pending.map(async (pendingWebhook) => {
          try {
            return (await pendingWebhook.fire()).success
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

      succeeded = firings.filter((request) => request).length
      const failed = firings.filter((request) => !request).length

      console.log(
        `[accountWebhooks] ${[
          succeeded > 0 && `${succeeded.toLocaleString()} succeeded`,
          failed > 0 && `${failed.toLocaleString()} failed`,
        ]
          .filter(Boolean)
          .join(', ')}`
      )
    }

    // If no webhooks or all failed, wait between loops to prevent spamming.
    if (succeeded === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  process.exit(0)
}

main()

process.on('SIGINT', () => {
  shuttingDown = true
  console.log('\nShutting down after current batch finishes...')
})
