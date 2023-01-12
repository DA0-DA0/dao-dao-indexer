import Router from '@koa/router'
import { Op } from 'sequelize'

import {
  Block,
  FormulaType,
  FormulaTypeValues,
  compute,
  computeRange,
  typeIsFormulaType,
} from '@/core'
import { getTypedFormula } from '@/data'
import {
  Account,
  AccountCreditScope,
  Computation,
  Contract,
  Event,
  State,
} from '@/db'

import { validateBlockString } from './validate'

export const computer: Router.Middleware = async (ctx) => {
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
  const account = await Account.findAccountForKey(key)
  if (!account) {
    ctx.status = 401
    ctx.body = 'invalid API key'
    return
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
  let blockStep: number | undefined
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

    // If block step passed, validate.
    if (_blockStep && typeof _blockStep === 'string') {
      const parsedStep = parseInt(_blockStep, 10)
      if (isNaN(parsedStep) || parsedStep < 1) {
        ctx.status = 400
        ctx.body = 'step must be a positive integer'
        return
      }
      blockStep = parsedStep
    }

    // if (blocks[1].height - blocks[0].height > 446400) {
    //   ctx.status = 400
    //   ctx.body = 'the range cannot be larger than 446400 blocks'
    //   return
    // }
  }

  // If time passed, validate.
  let time: number | undefined
  if (_time && typeof _time === 'string') {
    try {
      time = parseInt(_time, 10)
    } catch (err) {
      ctx.status = 400
      ctx.body = err instanceof Error ? err.message : err
      return
    }
  }

  // If times passed, validate that it's a range with either a start or a
  // start/end pair.
  let times: [number, number | undefined] | undefined
  let timeStep: number | undefined
  if (_times && typeof _times === 'string') {
    const [startTime, endTime] = _times.split('..')
    if (!startTime) {
      ctx.status = 400
      ctx.body = 'times must be just a start time or both a start and end time'
      return
    }

    try {
      times = [
        parseInt(startTime, 10),
        endTime ? parseInt(endTime, 10) : undefined,
      ]
    } catch (err) {
      ctx.status = 400
      ctx.body = err instanceof Error ? err.message : err
      return
    }

    if (
      times[0] >= (times[1] || Number.MAX_SAFE_INTEGER) ||
      (times[1] && times[1] < 0)
    ) {
      ctx.status = 400
      ctx.body = 'the start time must be less than the end time'
      return
    }

    // If time step passed, validate.
    if (_timeStep && typeof _timeStep === 'string') {
      const parsedStep = parseInt(_timeStep, 10)
      if (isNaN(parsedStep) || parsedStep < 1) {
        ctx.status = 400
        ctx.body = 'step must be a positive integer'
        return
      }
      timeStep = parsedStep
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

  // If type is "contract", validate that contract exists.
  if (type === FormulaType.Contract && !(await Contract.findByPk(address))) {
    ctx.status = 404
    ctx.body = 'contract not found'
    return
  }

  // If formula is dynamic, we can't compute it over a range since we need
  // specific blocks to compute it for.
  if (typedFormula.formula.dynamic && blocks) {
    ctx.status = 400
    ctx.body =
      'cannot compute dynamic formula over a range of blocks (compute it for specific blocks instead)'
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

    // If time passed, compute block that correlates with that time.
    if (time) {
      // If time is negative, subtract from latest block.
      if (time < 0) {
        time += state.latestBlockTimeUnixMs
      }

      block = (
        await Event.findOne({
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
        times[0] += state.latestBlockTimeUnixMs
      }
      if (times[1] && times[1] < 0) {
        times[1] += state.latestBlockTimeUnixMs
      }

      const startBlock = (
        await Event.findOne({
          where: {
            blockTimeUnixMs: {
              [Op.lte]: times[0],
            },
          },
          order: [['blockTimeUnixMs', 'DESC']],
        })
      )?.block
      // Use latest block if no end time exists.
      const endBlock = times[1]
        ? (
            await Event.findOne({
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
      // Use account credit, failing if unavailable.
      if (!(await account.useCredit(AccountCreditScope.Range))) {
        ctx.status = 402
        ctx.body = 'insufficient credits'
        return
      }

      let outputs: {
        value: any
        blockHeight: number
        blockTimeUnixMs: number
      }[] = []

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
            blockHeight: block.height ?? -1,
            blockTimeUnixMs: block.timeUnixMs ?? -1,
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
          blockHeight: block?.height ?? -1,
          blockTimeUnixMs: block?.timeUnixMs ?? -1,
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

      // Skip to match step.
      if (
        (blockStep === undefined || blockStep === 1) &&
        (timeStep === undefined || timeStep === 1)
      ) {
        computation = outputs
      } else if (blockStep) {
        computation = []
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
            computation.push({
              at: blockHeight,
              ...outputs[index - 1],
            })
            // Remove all computations before the one we just added, keeping the
            // current one in case nothing has changed in the next step.
            outputs.splice(0, index - 1)
          }
        }
      } else if (times && timeStep) {
        computation = []
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
            computation.push({
              at: blockTime,
              ...outputs[index - 1],
            })
            // Remove all computations before the one we just added, keeping the
            // current one in case nothing has changed in the next step.
            outputs.splice(0, index - 1)
          }
        }
      }
    } else {
      // Otherwise compute for single block.

      // Use account credit, failing if unavailable.
      if (
        !(await account.useCredit(
          block === undefined || block.height === state.latestBlock.height
            ? AccountCreditScope.Latest
            : AccountCreditScope.Historical
        ))
      ) {
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
        // each block.
        if (!typedFormula.formula.dynamic) {
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
  }
}
