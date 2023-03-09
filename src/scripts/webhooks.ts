import * as Sentry from '@sentry/node'
import { Command } from 'commander'
import { Op } from 'sequelize'

import { loadConfig } from '@/core/config'
import { DbType } from '@/core/types'
import { PendingWebhook, loadDb } from '@/db'

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
  // Connect to both DBs.
  await loadDb({
    type: DbType.Data,
  })
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
      } [webhooks] Succeeded: ${succeeded.toLocaleString()}. Failed: ${failed.toLocaleString()}.`
    )
  }

  // Print latest statistics every 100ms.
  logInterval = setInterval(printStatistics, 100)
  // Allow process to exit even though this interval is alive.
  logInterval.unref()

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

    const requests = await Promise.allSettled(
      pending.map((pendingWebhook) => pendingWebhook.fire())
    )

    succeeded += requests.filter(
      (request) => request.status === 'fulfilled'
    ).length
    failed += requests.filter((request) => request.status === 'rejected').length

    // Wait one second between webhook checks so we're not spamming the DB.
    await new Promise((resolve) => setTimeout(resolve, 1000))
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
