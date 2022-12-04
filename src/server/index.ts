import cors from '@koa/cors'
import Router from '@koa/router'
import Koa from 'koa'

import { Contract, closeDb, loadDb } from '../db'
import { computeFormula } from './compute'
import { getFormula } from './formulas'

const app = new Koa()
const router = new Router()

// CORS.
app.use(cors())

// Logger.
app.use(async (ctx, next) => {
  await next()
  const rt = ctx.response.get('X-Response-Time')
  console.log(`${ctx.method} ${ctx.url} - ${ctx.status} - ${rt}`)
})

// Add X-Response-Time header.
app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  ctx.set('X-Response-Time', `${ms}ms`)
})

// Main formula computer.
router.get('/:targetContractAddress/(.+)', async (ctx) => {
  const { blockHeight: _blockHeight } = ctx.query
  const { targetContractAddress } = ctx.params
  const formulaName = ctx.path.split('/').slice(2)

  // If blockHeight passed, validate that it's a number.
  let blockHeight: number | undefined
  if (_blockHeight && typeof _blockHeight === 'string') {
    blockHeight = parseInt(_blockHeight)
    if (isNaN(blockHeight)) {
      ctx.status = 400
      ctx.body = 'blockHeight must be a number'
      return
    }
  }

  // Validate that formula exists.
  const formula = getFormula(formulaName)
  if (!formula) {
    ctx.status = 404
    ctx.body = 'formula not found'
    return
  }

  // Validate that contract exists.
  const contract = await Contract.findByPk(targetContractAddress)
  if (!contract) {
    ctx.status = 404
    ctx.body = 'contract not found'
    return
  }

  try {
    ctx.body = await computeFormula(formula, contract, blockHeight)
  } catch (err) {
    ctx.status = 500
    ctx.body = err instanceof Error ? err.message : `${err}`
  }
})

// Enable router.
app.use(router.routes()).use(router.allowedMethods())

// Start.
const main = async () => {
  // Connect to DB.
  await loadDb()

  app.listen(3420, () => {
    console.log('Listening on 3420...')

    // Tell pm2 we're ready.
    process.send('ready')
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
