import cors from '@koa/cors'
import Router from '@koa/router'
import { Command } from 'commander'
import Koa from 'koa'
import { v4 as uuidv4 } from 'uuid'

import { loadConfig } from '@/core'
import { closeDb, loadDb } from '@/db'

import { computer } from './computer'

// Parse arguments.
const program = new Command()
program.option('-p, --port <port>', 'port to listen on', '3420')
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.parse()
const options = program.opts()

// Setup app.
const app = new Koa()
const router = new Router()

// CORS.
const allowedOrigins = [
  // localhost
  /^https?:\/\/localhost(:\d+)?$/,
  // daodao.zone
  /^https:\/\/(www\.)?daodao\.zone$/,
  // testnet.daodao.zone
  /^https:\/\/testnet\.daodao\.zone$/,
  // Vercel preview URLs.
  /^https:\/\/dao-dao-[^\.]+-da0da0.vercel.app$/,
]
app.use(
  cors({
    origin: (ctx) => {
      const origin = ctx.headers.origin
      if (origin && allowedOrigins.some((allowed) => allowed.test(origin))) {
        return origin
      }
      return 'https://daodao.zone'
    },
  })
)

// Logger.
app.use(async (ctx, next) => {
  const id = uuidv4()
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

// Ping.
router.get('/ping', () => new Response('pong'))

// Formula computer.
router.get('/:key/:type/:address/(.+)', computer)

// Enable router.
app.use(router.routes()).use(router.allowedMethods())

// Start.
const main = async () => {
  // Load config with config option.
  loadConfig(options.config)

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
