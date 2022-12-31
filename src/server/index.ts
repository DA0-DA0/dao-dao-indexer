import cors from '@koa/cors'
import Router from '@koa/router'
import { Command } from 'commander'
import Koa from 'koa'
import { Op } from 'sequelize'
import { v4 as uuidv4 } from 'uuid'

import { Block, compute, computeRange, loadConfig } from '@/core'
import { getContractFormula, getWalletFormula } from '@/data'
import { Computation, Contract, State, closeDb, loadDb } from '@/db'

import { validateBlockString } from './validate'

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
app.use(cors())

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

// Formula computer.
router.get('/:type/:address/(.+)', async (ctx) => {
  const { block: _block, blocks: _blocks, ...args } = ctx.query
  const { type, address } = ctx.params

  // Validate type.
  if (type !== 'contract' && type !== 'wallet') {
    ctx.status = 400
    ctx.body = 'type must be contract or wallet'
    return
  }

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

    if (blocks[1].height - blocks[0].height > 446400) {
      ctx.status = 400
      ctx.body = 'the range cannot be larger than 446400 blocks'
      return
    }
  }

  // Validate that formula exists.
  const formulaName = ctx.path.split('/').slice(3).join('/')
  const typeAndFormula =
    type === 'contract'
      ? ({
          type,
          formula: getContractFormula(formulaName)!,
        } as const)
      : ({
          type,
          formula: getWalletFormula(formulaName)!,
        } as const)
  if (!typeAndFormula.formula) {
    ctx.status = 404
    ctx.body = 'formula not found'
    return
  }

  // If type is "contract", validate that contract exists.
  if (type === 'contract' && !(await Contract.findByPk(address))) {
    ctx.status = 404
    ctx.body = 'contract not found'
    return
  }

  try {
    const state = await State.getSingleton()
    if (!state) {
      throw new Error('State not found')
    }

    let computation

    const computationWhere = {
      targetAddress: address,
      formula: formulaName,
      args: JSON.stringify(args),
    }

    // If blocks passed, compute range. A range query will probably return with
    // an initial block below the requested start block. This is because the
    // formula output that's valid at the provided start block depends on key
    // events that happened in the past. Each computation in the range indicates
    // what block it was first valid at, so the first one should too.
    if (blocks) {
      // Cap end block at latest block.
      if (blocks[1].height > state.latestBlockHeight) {
        blocks[1] = state.latestBlock
      }

      // Find existing start and end computations, and verify all are valid
      // between. If not, compute range.
      let existingUsed = false

      const existingStartComputation = await Computation.findOne({
        where: {
          ...computationWhere,
          blockHeight: {
            [Op.lte]: blocks[0].height,
          },
        },
        order: [['blockHeight', 'DESC']],
      })
      // If start computation exists, check the rest.
      if (existingStartComputation) {
        const existingRestComputations = await Computation.findAll({
          where: {
            ...computationWhere,
            blockHeight: {
              [Op.gt]: blocks[0].height,
              [Op.lte]: blocks[1].height,
            },
          },
          order: [['blockHeight', 'ASC']],
        })

        // Ensure entire range is covered by checking if validations are
        // chained. In other words, check that each computation is valid up
        // until the block just before the next computation starts.
        let existingComputations = [
          existingStartComputation,
          ...existingRestComputations,
        ]
        const isRangeCoveredBeforeEnd = existingComputations.every(
          (computation, i) =>
            i === existingComputations.length - 1 ||
            computation.latestBlockHeightValid ===
              existingComputations[i + 1].blockHeight - 1
        )

        // If range is covered, ensure that the end computation is valid at the
        // end block.
        let entireRangeValid =
          isRangeCoveredBeforeEnd &&
          (await existingComputations[
            existingComputations.length - 1
          ].updateValidityUpToBlockHeight(blocks[1].height))

        // If range is covered until the end, we are dealing with an incomplete
        // but continuous range. Load just the rest.
        if (isRangeCoveredBeforeEnd && !entireRangeValid) {
          const missingComputations = await computeRange({
            ...typeAndFormula,
            targetAddress: address,
            args,
            // Start at the block of the last existing computation, since we
            // need the block time to perform computations but cannot retrieve
            // that information with just `latestBlockHeightValid`.
            blockStart:
              existingComputations[existingComputations.length - 1].block,
            blockEnd: blocks[1],
          })

          // Ignore first computation since it's equivalent to the last existing
          // computation.
          missingComputations.shift()

          // Cache computations for future queries.
          const createdMissingComputations =
            await Computation.createFromComputationOutputs(
              address,
              formulaName,
              args,
              ...missingComputations
            )

          // Avoid using push(...items) since there is a limit to the number of
          // arguments that can be put on the stack, and the number of
          // computations may be very large.
          existingComputations = [
            ...existingComputations,
            ...createdMissingComputations,
          ]

          entireRangeValid = await existingComputations[
            existingComputations.length - 1
          ].updateValidityUpToBlockHeight(blocks[1].height)
        }

        if (entireRangeValid) {
          computation = existingComputations.map(({ block, output }) => ({
            value: output && JSON.parse(output),
            blockHeight: block.height ?? -1,
            blockTimeUnixMs: block.timeUnixMs ?? -1,
          }))
          existingUsed = true
        }
      }

      // If could not find existing range, compute.
      if (!existingUsed) {
        const rangeComputations = await computeRange({
          ...typeAndFormula,
          targetAddress: address,
          args,
          blockStart: blocks[0],
          blockEnd: blocks[1],
        })

        computation = rangeComputations.map(({ block, ...data }) => ({
          ...data,
          // If no block, the computation must not have accessed any keys. It
          // may be a constant formula, in which case it doesn't have any block
          // context.
          blockHeight: block?.height ?? -1,
          blockTimeUnixMs: block?.timeUnixMs ?? -1,
          // Remove dependencies and latest block height valid from output.
          dependencies: undefined,
          latestBlockHeightValid: undefined,
        }))

        // Cache computations for future queries.
        await Computation.createFromComputationOutputs(
          address,
          formulaName,
          args,
          ...rangeComputations
        )
      }
    } else {
      // Otherwise compute for single block.

      // Use latest block if not provided.
      if (block === undefined) {
        block = state.latestBlock
      }
      // Get most recent computation.
      const existingComputation = await Computation.findOne({
        where: {
          ...computationWhere,
          blockHeight: {
            [Op.lte]: block.height,
          },
        },
        order: [['blockHeight', 'DESC']],
      })

      // If found existing computation, check its validity.
      const existingComputationValid =
        existingComputation !== null &&
        (await existingComputation.updateValidityUpToBlockHeight(block.height))

      if (existingComputation && existingComputationValid) {
        computation =
          existingComputation.output && JSON.parse(existingComputation.output)
      } else {
        // Compute if did not find or use existing.
        const computationOutput = await compute({
          ...typeAndFormula,
          targetAddress: address,
          args,
          block,
        })

        computation = computationOutput.value

        // Cache computation for future queries.
        await Computation.createFromComputationOutputs(
          address,
          formulaName,
          args,
          {
            ...computationOutput,
            // Valid up to the current block.
            latestBlockHeightValid: block.height,
          }
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
    console.error(err)

    ctx.status = 500
    ctx.body = err instanceof Error ? err.message : `${err}`
  }
})

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
