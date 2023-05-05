import Router from '@koa/router'
import { Op } from 'sequelize'

import {
  Block,
  FormulaType,
  FormulaTypeValues,
  compute,
  computeRange,
  loadConfig,
  typeIsFormulaType,
  validateBlockString,
} from '@/core'
import { getTypedFormula } from '@/data'
import {
  AccountKey,
  AccountKeyCredit,
  Computation,
  Contract,
  State,
  Validator,
  WasmStateEvent,
} from '@/db'

import { captureSentryException } from '../../sentry'

// Map IP address to last time it was used.
const testRateLimit = new Map<string, number>()
const testCooldownSeconds = 10

export const computer: Router.Middleware = async (ctx) => {
  const config = loadConfig()

  const {
    block: _block,
    blocks: _blocks,
    blockStep: _blockStep,
    time: _time,
    times: _times,
    timeStep: _timeStep,
    ...args
  } = ctx.query

  // Support both /:key/:type/:address/:formula and /:type/:address/:formula
  // with `key` in the `x-api-key` header.
  const paths = ctx.path.split('/').slice(1)
  let key: string | undefined
  let type: FormulaType | undefined
  let address: string | undefined
  let formulaName: string | undefined

  if (paths.length < 3) {
    ctx.status = 400
    ctx.body = 'missing required parameters'
    return
  }

  // Validate type, which may be one of the first two path items.

  // /:type/:address/:formula
  if (typeIsFormulaType(paths[0])) {
    key =
      typeof ctx.headers['x-api-key'] === 'string'
        ? ctx.headers['x-api-key']
        : undefined
    type = paths[0]
    address = paths[1]
    formulaName = paths.slice(2).join('/')
  }
  // /:key/:type/:address/:formula
  else if (typeIsFormulaType(paths[1])) {
    key = paths[0]
    type = paths[1]
    address = paths[2]
    formulaName = paths.slice(3).join('/')
  } else {
    ctx.status = 400
    ctx.body = `type must be one of: ${FormulaTypeValues.join(', ')}`
    return
  }

  // Validate API key.
  if (!key) {
    ctx.status = 401
    ctx.body = 'missing API key'
    return
  }
  const accountKey = await AccountKey.findForKey(key)
  if (!accountKey) {
    ctx.status = 401
    ctx.body = 'invalid API key'
    return
  }

  // If test account key, apply CORS and rate limit.
  if (accountKey.isTest) {
    // CORS.
    if (ctx.req.headers['origin'] === 'http://localhost:3000') {
      ctx.set('Access-Control-Allow-Origin', 'http://localhost:3000')
    } else {
      ctx.set('Access-Control-Allow-Origin', 'https://indexer.zone')
    }

    // Remove old rate limited IPs.
    const now = Date.now()
    for (const [ip, lastUsed] of testRateLimit.entries()) {
      if (now - lastUsed >= testCooldownSeconds * 1000) {
        testRateLimit.delete(ip)
      }
    }

    // Rate limit.
    const lastUsed = testRateLimit.get(ctx.ip)
    if (lastUsed && now - lastUsed < testCooldownSeconds * 1000) {
      ctx.status = 429
      ctx.body = `${testCooldownSeconds} second test rate limit exceeded`
      return
    }
    testRateLimit.set(ctx.ip, now)
  }

  // Validate address.
  if (!address) {
    ctx.status = 400
    ctx.body = 'missing address'
    return
  }

  // Validate formulaName.
  if (!formulaName) {
    ctx.status = 400
    ctx.body = 'missing formula'
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
  let blockStep: bigint | undefined
  if (_blocks && typeof _blocks === 'string') {
    const [startBlock, endBlock] = _blocks.split('..')
    if (!startBlock || !endBlock) {
      ctx.status = 400
      ctx.body = 'blocks must be a range of two blocks'
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
      ctx.body = 'the start block must be before the end block'
      return
    }

    // If block step passed, validate.
    if (_blockStep && typeof _blockStep === 'string') {
      try {
        blockStep = BigInt(_blockStep)
        if (blockStep < 1) {
          throw new Error()
        }
      } catch (err) {
        ctx.status = 400
        ctx.body = 'block step must be a positive integer'
        return
      }
    }
  }

  // If time passed, validate.
  let time: bigint | undefined
  if (_time && typeof _time === 'string') {
    try {
      time = BigInt(_time)
      if (time < 0) {
        throw new Error()
      }
    } catch (err) {
      ctx.status = 400
      ctx.body = 'time must be an integer greater than or equal to zero'
      return
    }
  }

  // TODO: Calculate start and end block with times some other way. Or don't use
  // start and end blocks at all and use block or time depending on which is
  // passed? Right now, the block is retrieved by checking `WasmEvent`s, but
  // there are many times of events now and any formula can use any event type.
  // This needs a better solution.

  // If times passed, validate that it's a range with either a start or a
  // start/end pair.
  let times: [bigint, bigint | undefined] | undefined
  let timeStep: bigint | undefined
  if (_times && typeof _times === 'string') {
    const [startTime, endTime] = _times.split('..')
    if (!startTime) {
      ctx.status = 400
      ctx.body = 'times must be just a start time or both a start and end time'
      return
    }

    try {
      times = [BigInt(startTime), endTime ? BigInt(endTime) : undefined]
    } catch (err) {
      ctx.status = 400
      ctx.body = 'times must be integers'
      return
    }

    if (times[1] !== undefined && times[0] >= times[1]) {
      ctx.status = 400
      ctx.body = 'the start time must be less than the end time'
      return
    }

    // If time step passed, validate.
    if (_timeStep && typeof _timeStep === 'string') {
      try {
        const parsedStep = BigInt(_timeStep)
        if (parsedStep < 1) {
          throw new Error()
        }

        timeStep = parsedStep
      } catch (err) {
        ctx.status = 400
        ctx.body = 'time step must be a positive integer'
        return
      }
    }
  }

  // Validate that formula exists.
  let typedFormula
  try {
    typedFormula = getTypedFormula(type, formulaName)
  } catch {
    ctx.status = 404
    ctx.body = 'formula not found'
    return
  }

  // If type is "contract"...
  if (typedFormula.type === FormulaType.Contract) {
    const contract = await Contract.findByPk(address)

    // ...validate that contract exists.
    if (!contract) {
      ctx.status = 404
      ctx.body = 'contract not found'
      return
    }

    // ...validate that filter is satisfied.
    if (typedFormula.formula.filter) {
      let allowed = true

      if (typedFormula.formula.filter.codeIdsKeys?.length) {
        const allCodeIds = typedFormula.formula.filter.codeIdsKeys.flatMap(
          (key) => config.codeIds?.[key] ?? []
        )
        allowed &&= allCodeIds.includes(contract.codeId)
      }

      if (!allowed) {
        ctx.status = 405
        ctx.body = `the ${formulaName} formula does not apply to contract ${address}`
        return
      }
    }
  }
  // ...if type is "validator"...
  else if (typedFormula.type === FormulaType.Validator) {
    const validator = await Validator.findByPk(address)

    // ...validate that validator exists.
    if (!validator) {
      ctx.status = 404
      ctx.body = 'validator not found'
      return
    }
  }

  // If formula is dynamic, we can't compute it over a range since we need
  // specific blocks to compute it for.
  if (typedFormula.formula.dynamic && (blocks || times)) {
    ctx.status = 400
    ctx.body =
      'cannot compute dynamic formula over a range (compute it for a specific block/time instead)'
    return
  }

  let state = await State.getSingleton()
  try {
    if (!state) {
      throw new Error('State not found')
    }

    let computation

    const computationWhere = {
      targetAddress: address,
      formula: formulaName,
      args: JSON.stringify(args),
    }

    // If time passed, compute block that correlates with that time.
    if (time) {
      // If time is negative, subtract from latest block.
      if (time < 0) {
        time += BigInt(state.latestBlockTimeUnixMs)
      }

      block = (
        await WasmStateEvent.findOne({
          where: {
            blockTimeUnixMs: {
              [Op.lte]: time,
            },
          },
          order: [['blockTimeUnixMs', 'DESC']],
        })
      )?.block
    }

    // If times passed, compute blocks that correlate with those times.
    if (times) {
      // If times are negative, subtract from latest block.
      if (times[0] < 0) {
        times[0] += BigInt(state.latestBlockTimeUnixMs)
      }
      if (times[1] && times[1] < 0) {
        times[1] += BigInt(state.latestBlockTimeUnixMs)
      }

      const startBlock =
        (
          await WasmStateEvent.findOne({
            where: {
              blockTimeUnixMs: {
                [Op.lte]: times[0],
              },
            },
            order: [['blockTimeUnixMs', 'DESC']],
          })
        )?.block ??
        // Use first block if no event exists before start time.
        (
          await WasmStateEvent.findOne({
            order: [['blockTimeUnixMs', 'ASC']],
          })
        )?.block
      // Use latest block if no end time exists.
      const endBlock = times[1]
        ? (
            await WasmStateEvent.findOne({
              where: {
                blockTimeUnixMs: {
                  [Op.lte]: times[1],
                },
              },
              order: [['blockTimeUnixMs', 'DESC']],
            })
          )?.block
        : state.latestBlock

      if (startBlock && endBlock) {
        blocks = [startBlock, endBlock]
      }
    }

    // If blocks passed, compute range. A range query will probably return with
    // an initial block below the requested start block. This is because the
    // formula output that's valid at the provided start block depends on key
    // events that happened in the past. Each computation in the range indicates
    // what block it was first valid at, so the first one should too.
    if (blocks) {
      // Cap end block at latest block.
      if (blocks[1].height > BigInt(state.latestBlockHeight)) {
        blocks[1] = state.latestBlock
      }

      // Use account credit, failing if unavailable.
      if (
        !(await accountKey.useCredit(
          AccountKeyCredit.creditsForBlockInterval(
            // Add 1n because both blocks are inclusive.
            blocks[1].height - blocks[0].height + 1n
          )
        ))
      ) {
        ctx.status = 402
        ctx.body = 'insufficient credits'
        return
      }

      let outputs: {
        value: any
        blockHeight: bigint
        blockTimeUnixMs: bigint
      }[] = []

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
            BigInt(computation.latestBlockHeightValid) ===
              BigInt(existingComputations[i + 1].blockHeight) - 1n
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
            ...typedFormula,
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
              typedFormula,
              args,
              missingComputations
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
          outputs = existingComputations.map(({ block, output }) => ({
            value: output && JSON.parse(output),
            blockHeight: block.height ?? -1n,
            blockTimeUnixMs: block.timeUnixMs ?? -1n,
          }))
          existingUsed = true
        }
      }

      // If could not find existing range, compute.
      if (!existingUsed) {
        const rangeComputations = await computeRange({
          ...typedFormula,
          targetAddress: address,
          args,
          blockStart: blocks[0],
          blockEnd: blocks[1],
        })

        outputs = rangeComputations.map(({ block, ...data }) => ({
          ...data,
          // If no block, the computation must not have accessed any keys. It
          // may be a constant formula, in which case it doesn't have any block
          // context.
          blockHeight: block?.height ?? -1n,
          blockTimeUnixMs: block?.timeUnixMs ?? -1n,
          // Remove dependencies and latest block height valid from output.
          dependencies: undefined,
          latestBlockHeightValid: undefined,
        }))

        // Cache computations for future queries.
        await Computation.createFromComputationOutputs(
          address,
          typedFormula,
          args,
          rangeComputations
        )
      }

      let response: {
        at?: string
        value: any
        // TODO: Turn into strings?
        blockHeight: number
        blockTimeUnixMs: number
      }[] = []
      // Skip to match step.
      if (
        (blockStep === undefined || blockStep === 1n) &&
        (timeStep === undefined || timeStep === 1n)
      ) {
        response = outputs.map(({ value, blockHeight, blockTimeUnixMs }) => ({
          value,
          blockHeight: Number(blockHeight),
          blockTimeUnixMs: Number(blockTimeUnixMs),
        }))
      } else if (blockStep) {
        for (
          let blockHeight = blocks[0].height;
          blockHeight <= blocks[1].height;
          blockHeight += blockStep
        ) {
          // Sorted ascending by block, so find first computation with block
          // height greater than desired block height and use the previous to
          // get the latest value at the target block height.
          const index = outputs.findIndex((c) => c.blockHeight > blockHeight)
          if (index > 0) {
            const output = outputs[index - 1]
            response.push({
              at: blockHeight.toString(),
              value: output.value,
              blockHeight: Number(output.blockHeight),
              blockTimeUnixMs: Number(output.blockTimeUnixMs),
            })
            // Remove all computations before the one we just added, keeping the
            // current one in case nothing has changed in the next step.
            outputs.splice(0, index - 1)
          }
        }
      } else if (times && timeStep) {
        for (
          let blockTime = blocks[0].timeUnixMs;
          blockTime <= blocks[1].timeUnixMs;
          blockTime += timeStep
        ) {
          // Sorted ascending by block, so find first computation with block
          // time greater than desired block time and use the previous to get
          // the latest value at the target block time.
          const index = outputs.findIndex((c) => c.blockTimeUnixMs > blockTime)
          if (index > 0) {
            const output = outputs[index - 1]
            response.push({
              at: blockTime.toString(),
              value: output.value,
              blockHeight: Number(output.blockHeight),
              blockTimeUnixMs: Number(output.blockTimeUnixMs),
            })
            // Remove all computations before the one we just added, keeping the
            // current one in case nothing has changed in the next step.
            outputs.splice(0, index - 1)
          }
        }
      }

      computation = response
    } else {
      // Otherwise compute for single block.

      // Use account credit, failing if unavailable.
      if (!(await accountKey.useCredit())) {
        ctx.status = 402
        ctx.body = 'insufficient credits'
        return
      }

      // Use latest block if not provided.
      if (block === undefined) {
        block = state.latestBlock
      }
      // Get most recent computation if this formula does not change each block.
      const existingComputation = typedFormula.formula.dynamic
        ? null
        : await Computation.findOne({
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
          ...typedFormula,
          targetAddress: address,
          args,
          block,
        })

        computation = computationOutput.value

        // Cache computation for future queries if this formula does not change
        // each block and if it outputted a non-undefined/non-null value.
        if (
          !typedFormula.formula.dynamic &&
          computationOutput.value !== undefined &&
          computationOutput.value !== null
        ) {
          await Computation.createFromComputationOutputs(
            address,
            typedFormula,
            args,
            [
              {
                ...computationOutput,
                // Valid up to the current block.
                latestBlockHeightValid: block.height,
              },
            ]
          )
        }
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

    captureSentryException(ctx, err, {
      tags: {
        blockHeight: state?.latestBlockHeight,
        blockTimeUnixMs: state?.latestBlockTimeUnixMs,
        key,
        type,
        address,
        formulaName,
        accountId: accountKey?.id,
        accountName: accountKey?.name,
      },
    })
  }
}
