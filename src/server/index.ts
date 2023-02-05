import { randomUUID } from 'crypto'

import cors from '@koa/cors'
import * as Sentry from '@sentry/node'
import { Command } from 'commander'
import Koa from 'koa'

import { loadConfig } from '@/core'
import { closeDb, loadDb } from '@/db'

import { setupRouter } from './routes'
import { captureSentryException } from './sentry'

// Parse arguments.
const program = new Command()
program.option('-p, --port <port>', 'port to listen on', '3420')
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.parse()
const options = program.opts()

// Load config with config option.
const config = loadConfig(options.config)

// Setup app.
const app = new Koa()

// Add Sentry error reporting.
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
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
setupRouter(app)

// Start.
const main = async () => {
  // Connect to DB.
  await loadDb()

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

// On exit, close DB connection.
const cleanup = async () => {
  console.log('Shutting down...')
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
