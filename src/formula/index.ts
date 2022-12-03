import Router from '@koa/router'
import Koa from 'koa'

import { loadConfig } from '../config'
import { Contract, closeDb, loadDb } from '../db'
import { compute, getFormula } from './formulas'

const app = new Koa()
const router = new Router()

// Logger.
app.use(async (ctx, next) => {
  await next()
  const rt = ctx.response.get('X-Response-Time')
  console.log(`${ctx.method} ${ctx.url} - ${ctx.status} - ${rt}`)
})

// Add x-response-time header.
app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  ctx.set('X-Response-Time', `${ms}ms`)
})

// Add routes.
router.get('/:formulaName/:targetContractAddress', async (ctx) => {
  const { formulaName, targetContractAddress } = ctx.params

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

  ctx.body = await compute(formula, contract)
})

router.get('/:formulaName/:targetContractAddress/:blockHeight', async (ctx) => {
  const {
    formulaName,
    targetContractAddress,
    blockHeight: _blockHeight,
  } = ctx.params

  // Validate that formula exists.
  const formula = getFormula(formulaName)
  if (!formula) {
    ctx.status = 404
    ctx.body = `formula ${formulaName} not found`
    return
  }

  // Validate that contract exists.
  const contract = await Contract.findByPk(targetContractAddress)
  if (!contract) {
    ctx.status = 404
    ctx.body = 'contract not found'
    return
  }

  // Validate that blockHeight is a number.
  const blockHeight = parseInt(_blockHeight)
  if (isNaN(blockHeight)) {
    ctx.status = 400
    ctx.body = 'blockHeight must be a number'
    return
  }

  ctx.body = await compute(formula, contract, blockHeight)
})

// Enable router.
app.use(router.routes()).use(router.allowedMethods())

// Start.
const main = async () => {
  // Connect to DB.
  const { db } = await loadConfig()
  await loadDb(db)

  app.listen(3000)
  console.log('Listening on 3000...')
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
