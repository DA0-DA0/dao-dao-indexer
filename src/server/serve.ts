import { randomUUID } from 'crypto'

import cors from '@koa/cors'
import * as Sentry from '@sentry/node'
import { Command } from 'commander'
import Koa from 'koa'

import { loadConfig, stopConfigWatch } from '@/config'
import { closeDb, loadDb } from '@/db'
import { WasmCodeService } from '@/services/wasm-codes'
import { DbType } from '@/types'

import { setUpRouter } from './routes'
import { captureSentryException } from './sentry'

// Parse arguments.
const program = new Command()
program.option('-p, --port <port>', 'port to listen on', '3420')
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.option('-a, --accounts', 'run account server instead of indexer server')
program.parse()
const options = program.opts()

// Load config with config option.
const config = loadConfig(options.config)

const accounts = !!options.accounts

// Setup app.
const app = new Koa()

// Add Sentry error reporting.
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    // Don't send these to Sentry as we don't need to be notified for them or
    // they are spam and waste our quota.
    ignoreErrors: ['BadRequestError'],
  })

  // Add Sentry error handler.
  app.on('error', (err, ctx) => {
    captureSentryException(ctx, err)
  })
}

// Use CORS on all routes.
app.use(cors())

// Logger.
app.use(async (ctx, next) => {
  const id = randomUUID()
  console.log(`[${id}] ${ctx.method} ${ctx.url} @ ${new Date().toISOString()}`)

  await next()

  const rt = ctx.response.get('X-Response-Time')
  console.log(`[${id}] ${ctx.method} ${ctx.url} - ${ctx.status} - ${rt}`)
})

// Add X-Response-Time header.
app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  ctx.set('X-Response-Time', `${ms}ms`)
})

// Add routes.
setUpRouter(app, {
  config,
  accounts,
})

let wasmCodeService: WasmCodeService | null = null

// Start.
const main = async () => {
  // All servers need to connect to the accounts DB.
  await loadDb({
    type: DbType.Accounts,
  })

  // Only connect to data if we're not serving the accounts API (i.e. we're
  // serving indexer data).
  if (!accounts) {
    await loadDb({
      type: DbType.Data,
    })

    // Set up wasm code service.
    wasmCodeService = await WasmCodeService.setUpInstance({
      withUpdater: true,
    })
  }

  if (!options.port || isNaN(options.port)) {
    throw new Error('Port must be a number')
  }

  app.listen(options.port, () => {
    console.log(`Listening on ${options.port}...`)

    // Tell pm2 we're ready.
    if (process.send) {
      process.send('ready')
    }
  })
}

main()

// On exit, stop services and close DB connection.
const cleanup = async () => {
  console.log('Shutting down...')

  if (wasmCodeService) {
    wasmCodeService.stopUpdater()
  }

  stopConfigWatch()

  await closeDb()
}

process.on('exit', async (code) => {
  await cleanup()
  process.exit(code)
})
// Cleanup by calling exit.
process.on('SIGINT', async () => {
  process.exit()
})
process.on('SIGTERM', async () => {
  process.exit()
})
process.on('SIGUSR1', async () => {
  process.exit()
})
process.on('SIGUSR2', async () => {
  process.exit()
})
