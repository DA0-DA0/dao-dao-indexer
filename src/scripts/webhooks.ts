import * as Sentry from '@sentry/node'
import { Command } from 'commander'
import { Op } from 'sequelize'

import { loadConfig } from '@/core/config'
import { DbType } from '@/core/types'
import { PendingWebhook, loadDb } from '@/db'

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
  // Connect to both DBs.
  await loadDb({
    type: DbType.Data,
  })
  await loadDb({
    type: DbType.Accounts,
  })

  console.log(`\n[webhooks] Firing webhooks at ${new Date().toISOString()}...`)

  while (!shuttingDown) {
    const pending = await PendingWebhook.findAll({
      where: {
        failures: {
          // Retry up to 3 times.
          [Op.lt]: 3,
        },
      },
      limit: batch,
    })

    let succeeded = 0
    if (pending.length > 0) {
      const requests = await Promise.allSettled(
        pending.map((pendingWebhook) => pendingWebhook.fire())
      )

      succeeded = requests.filter(
        (request) => request.status === 'fulfilled'
      ).length
      const failed = requests.filter(
        (request) => request.status === 'rejected'
      ).length

      console.log(
        `[webhooks] ${[
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
