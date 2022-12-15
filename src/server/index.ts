import cors from '@koa/cors'
import Router from '@koa/router'
import Koa from 'koa'

import { compute, computeRange, getFormula } from '../core'
import { Block } from '../core/types'
import { Computation, Contract, State, closeDb, loadDb } from '../db'
import { validateBlockString } from './validate'

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
  const { block: _block, blocks: _blocks, ...args } = ctx.query
  const { targetContractAddress } = ctx.params

  // If block passed, validate.
  let block: Block | undefined
  if (_block && typeof _block === 'string') {
    try {
      block = validateBlockString(_block, 'block')
    } catch (err) {
      ctx.status = 400
      ctx.body = err instanceof Error ? err.message : err
      return
    }
  }

  // If blocks passed, validate that it's a range of two blocks.
  let blocks: [Block, Block] | undefined
  if (_blocks && typeof _blocks === 'string') {
    const [startBlock, endBlock] = _blocks.split('..')
    if (!startBlock || !endBlock) {
      ctx.status = 400
      ctx.body = 'blocks must be a range of two numbers'
      return
    }

    try {
      blocks = [
        validateBlockString(startBlock, 'the start block'),
        validateBlockString(endBlock, 'the end block'),
      ]
    } catch (err) {
      ctx.status = 400
      ctx.body = err instanceof Error ? err.message : err
      return
    }

    if (
      blocks[0].height >= blocks[1].height ||
      blocks[0].timeUnixMs >= blocks[1].timeUnixMs
    ) {
      ctx.status = 400
      ctx.body = 'the start block must be less than the end block'
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

    // If blocks passed, compute range. A range query will probably return with
    // an initial block below the requested start block. This is because the
    // formula output that's valid at the provided start block depends on key
    // events that happened in the past. Each computation in the range indicates
    // what block it was first valid at, so the first one should too.
    if (blocks) {
      // Find existing start and end computations. COMMENTING OUT FOR NOW since
      // we can't yet determine if an entire range has been cached or not. This
      // code below detects if any output in the range has been cached, and then
      // assumes the whole range is cached. If we are going to cache one-off
      // outputs (i.e. not ranges), then we can't detect if the whole range is
      // cached or not. The solution may be to not cache one-off outputs, and
      // instead only pre-compute ranges.

      // const existingStartComputation = await Computation.findOne({
      //   where: {
      //     contractAddress: contract.address,
      //     formula: formulaName,
      //     args: JSON.stringify(args),
      //     blockHeight: {
      //       [Op.lte]: blocks[0].height,
      //     },
      //   },
      //   order: [['blockHeight', 'DESC']],
      // })
      // const existingEndComputation = await Computation.findOne({
      //   where: {
      //     contractAddress: contract.address,
      //     formula: formulaName,
      //     args: JSON.stringify(args),
      //     blockHeight: {
      //       [Op.gt]: blocks[0].height,
      //       [Op.lte]: blocks[1].height,
      //     },
      //   },
      //   order: [['blockHeight', 'DESC']],
      // })

      // If either computation bound exists, get all computations between them.
      // if (existingStartComputation || existingEndComputation) {
      //   const middleComputations = await Computation.findAll({
      //     where: {
      //       contractAddress: contract.address,
      //       formula: formulaName,
      //       args: JSON.stringify(args),
      //       blockHeight: {
      //         ...(existingStartComputation && {
      //           [Op.gt]: existingStartComputation.blockHeight,
      //         }),
      //         ...(existingEndComputation && {
      //           [Op.lt]: existingEndComputation.blockHeight,
      //         }),
      //       },
      //     },
      //     order: [['blockHeight', 'ASC']],
      //   })

      //   // Use computations that exist.
      //   const computations = [
      //     ...(existingStartComputation ? [existingStartComputation] : []),
      //     ...middleComputations,
      //     ...(existingEndComputation ? [existingEndComputation] : []),
      //   ]

      //   computation = computations.map(
      //     ({ blockHeight, output }) => ({
      //       value: output && JSON.parse(output),
      //       blockHeight: block.height ?? -1,
      //       blockTimeUnixMs: block.timeUnixMs ?? -1,
      //     })
      //   )
      // } else {
      // Otherwise compute for range.
      const rangeComputations = await computeRange(
        formula,
        contract,
        args,
        blocks[0],
        blocks[1]
      )

      computation = rangeComputations.map(({ block, ...data }) => ({
        ...data,
        // If no block, the computation must not have accessed any keys. It may
        // be a constant formula, in which case it doesn't have any block
        // context.
        blockHeight: block?.height ?? -1,
        blockTimeUnixMs: block?.timeUnixMs ?? -1,
      }))

      // Cache computations for future queries.
      await Computation.createFromComputationOutputs(
        contract.address,
        formulaName,
        args,
        ...rangeComputations
      )
      // }
    } else {
      // Otherwise compute for single block.

      // Use latest block if not provided.
      if (block === undefined) {
        const state = await State.findOne({
          where: {
            singleton: true,
          },
        })
        if (!state) {
          throw new Error('State not found')
        }

        block = state.latestBlock
      }
      // const existingComputation = await Computation.findOne({
      //   where: {
      //     contractAddress: contract.address,
      //     formula: formulaName,
      //     args: JSON.stringify(args),
      //     ...(blockHeight !== undefined
      //       ? {
      //           blockHeight: {
      //             [Op.lte]: blockHeight,
      //           },
      //         }
      //       : undefined),
      //   },
      //   order: [['blockHeight', 'DESC']],
      // })

      // COMMENTING OUT FOR NOW since we can't yet determine if the latest
      // computation is up to date. It needs to be pre-computing on export to
      // ensure that this value is up to date. TODO: Pre-compute on export.
      // // If found existing computation, use that.
      // if (existingComputation) {
      //   computation =
      //     existingComputation.output && JSON.parse(existingComputation.output)
      // } else {
      // Otherwise compute.
      const computationOutput = await compute(formula, contract, args, block)

      computation = computationOutput.value

      // Cache computation for future queries.
      await Computation.createFromComputationOutputs(
        contract.address,
        formulaName,
        args,
        computationOutput
      )
      // }
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
