import cors from '@koa/cors'
import Router from '@koa/router'
import Koa from 'koa'
import { Op } from 'sequelize'

import { compute, computeRange, getFormula } from '../core'
import { Computation, Contract, closeDb, loadDb } from '../db'

const app = new Koa()
const router = new Router()

// CORS.
app.use(cors())

// Logger.
app.use(async (ctx, next) => {
  await next()
  const rt = ctx.response.get('X-Response-Time')
  console.log(
    `[${new Date().toISOString()}] ${ctx.method} ${ctx.url} - ${
      ctx.status
    } - ${rt}`
  )
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
  const {
    blockHeight: _blockHeight,
    blockHeights: _blockHeights,
    ...args
  } = ctx.query
  const { targetContractAddress } = ctx.params

  // If blockHeight passed, validate that it's a number.
  let blockHeight: number | undefined
  if (_blockHeight && typeof _blockHeight === 'string') {
    blockHeight = parseInt(_blockHeight, 10)
    if (isNaN(blockHeight)) {
      ctx.status = 400
      ctx.body = 'blockHeight must be a number'
      return
    }
    if (blockHeight < 1) {
      ctx.status = 400
      ctx.body = 'blockHeight must be at least 1'
      return
    }
  }

  // If blockHeights passed, validate that it's a range of two numbers.
  let blockHeights: [number, number] | undefined
  if (_blockHeights && typeof _blockHeights === 'string') {
    const [start, end] = _blockHeights.split('..').map((s) => parseInt(s, 10))
    if (isNaN(start) || isNaN(end)) {
      ctx.status = 400
      ctx.body = 'blockHeights must be a range of two numbers'
      return
    }
    blockHeights = [start, end]
    if (blockHeights[0] >= blockHeights[1]) {
      ctx.status = 400
      ctx.body = 'the start blockHeight must be less than the end'
      return
    }
    if (blockHeights[0] < 1) {
      ctx.status = 400
      ctx.body = 'blockHeights must be at least 1'
      return
    }
  }

  // Validate that formula exists.
  const formulaName = ctx.path.split('/').slice(2).join('/')
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
    let computation

    // If blockHeights passed, compute range. A range query will probably return
    // with an initial blockHeight below the requested start blockHeight. This
    // is because the formula output that's valid at the provided start
    // blockHeight depends on key events that happened in the past. Each
    // computation in the range indicates what blockHeight/blockTimeUnixMicro it
    // was first valid at, so the first one should too.
    if (blockHeights) {
      // Find existing start and end computations.
      const existingStartComputation = await Computation.findOne({
        where: {
          contractAddress: contract.address,
          formula: formulaName,
          args: JSON.stringify(args),
          blockHeight: {
            [Op.lte]: blockHeights[0],
          },
        },
        order: [['blockHeight', 'DESC']],
      })
      const existingEndComputation = await Computation.findOne({
        where: {
          contractAddress: contract.address,
          formula: formulaName,
          args: JSON.stringify(args),
          blockHeight: {
            [Op.gt]: blockHeights[0],
            [Op.lte]: blockHeights[1],
          },
        },
        order: [['blockHeight', 'DESC']],
      })

      // If either computation bound exists, get all computations between them.
      if (existingStartComputation || existingEndComputation) {
        const middleComputations = await Computation.findAll({
          where: {
            contractAddress: contract.address,
            formula: formulaName,
            args: JSON.stringify(args),
            blockHeight: {
              ...(existingStartComputation && {
                [Op.gt]: existingStartComputation.blockHeight,
              }),
              ...(existingEndComputation && {
                [Op.lt]: existingEndComputation.blockHeight,
              }),
            },
          },
          order: [['blockHeight', 'ASC']],
        })

        // Use computations that exist.
        const computations = [
          ...(existingStartComputation ? [existingStartComputation] : []),
          ...middleComputations,
          ...(existingEndComputation ? [existingEndComputation] : []),
        ]

        computation = computations.map(
          ({ blockHeight, blockTimeUnixMicro, output }) => ({
            value: output && JSON.parse(output),
            blockHeight: Number(blockHeight),
            blockTimeUnixMicro: Number(blockTimeUnixMicro),
          })
        )
      } else {
        // Otherwise compute for range.
        const rangeComputations = await computeRange(
          formula,
          contract,
          args,
          blockHeights[0],
          blockHeights[1]
        )

        computation = rangeComputations.map(
          ({ blockHeight, blockTimeUnixMicro, ...data }) => ({
            ...data,
            blockHeight: Number(blockHeight),
            blockTimeUnixMicro: Number(blockTimeUnixMicro),
          })
        )

        // Cache computations for future queries.
        await Computation.createFromComputationOutputs(
          contract.address,
          formulaName,
          args,
          ...rangeComputations
        )
      }
    } else {
      // Otherwise compute for single block.
      const existingComputation = await Computation.findOne({
        where: {
          contractAddress: contract.address,
          formula: formulaName,
          args: JSON.stringify(args),
          ...(blockHeight !== undefined
            ? {
                blockHeight: {
                  [Op.lte]: blockHeight,
                },
              }
            : undefined),
        },
        order: [['blockHeight', 'DESC']],
      })

      // If found existing computation, use that.
      if (existingComputation) {
        computation =
          existingComputation.output && JSON.parse(existingComputation.output)
      } else {
        // Otherwise compute.
        const computationOutput = await compute(
          formula,
          contract,
          args,
          blockHeight
        )

        computation = computationOutput.value

        // Cache computation for future queries.
        await Computation.createFromComputationOutputs(
          contract.address,
          formulaName,
          args,
          computationOutput
        )
      }
    }

    // If string, encode as JSON.
    if (typeof computation === 'string') {
      ctx.body = JSON.stringify(computation)
    } else {
      ctx.body = computation
    }

    ctx.set('Content-Type', 'application/json')
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
