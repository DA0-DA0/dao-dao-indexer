import { Op } from 'sequelize'

import { Contract, Event } from '../db/models'
import { getEnv } from './env'
import { Block, ComputationOutput, Formula } from './types'

export const compute = async (
  formula: Formula,
  targetContract: Contract,
  args: Record<string, any>,
  block: Block
): Promise<ComputationOutput> => {
  // Store the latest block that we've seen for all keys accessed. This is the
  // earliest this computation could have been made.
  let latestBlock: Block | undefined

  const updateLatestBlock = async (events: Event[]) => {
    if (events.length === 0) {
      return
    }

    const latestEvent = events.sort((a, b) => b.blockHeight - a.blockHeight)[0]

    // If latest is unset, or if we found a later block height, update.
    if (
      latestBlock === undefined ||
      latestEvent.blockHeight > latestBlock.height
    ) {
      latestBlock = latestEvent.block
    }
  }

  const dependentKeys = new Set<string>()
  const env = getEnv(
    targetContract.address,
    block,
    args,
    dependentKeys,
    updateLatestBlock
  )

  const value = await formula(env)

  return {
    block: latestBlock,
    value,
    dependentKeys: Array.from(dependentKeys),
  }
}

export const computeRange = async (
  formula: Formula,
  targetContract: Contract,
  args: Record<string, any>,
  blockStart: Block,
  blockEnd: Block
): Promise<ComputationOutput[]> => {
  const computeForBlockInRange = async (
    block: Block
  ): Promise<{
    nextPotentialBlock: Block | undefined
    latestBlock: Block | undefined
    value: any
    dependentKeys: string[]
  }> => {
    // Store the next block that has the potential to change the result. Each
    // getter below will update this value if it finds a key change event after
    // the current block we're computing. If it remains undefined, then we know
    // that the result will not change because no inputs changed.
    let nextPotentialBlock: Block | undefined

    // Find the next event that may change the result for the given key filter
    // and update accordingly. Ignore any events after the end block.
    const updateNextChangedBlock = async (
      contractAddress: string,
      keyFilter: string | object
    ) => {
      const nextEvent = await Event.findOne({
        where: {
          contractAddress,
          key: keyFilter,
          // After the current block and at or before the end block.
          blockHeight: {
            [Op.gt]: block.height,
            [Op.lte]: blockEnd.height,
          },
        },
        order: [['blockHeight', 'ASC']],
      })

      // If we found an event, and it's earlier than the current next potential
      // block (or if we haven't found one yet), update.
      if (
        nextEvent &&
        (nextPotentialBlock === undefined ||
          nextEvent.blockHeight < nextPotentialBlock.height)
      ) {
        nextPotentialBlock = nextEvent.block
      }
    }

    // Store the latest block that we've seen for all keys accessed. This is the
    // earliest this computation could have been made.
    let latestBlock: Block | undefined

    const updateLatestBlock = async (events: Event[]) => {
      if (events.length === 0) {
        return
      }

      const latestEvent = events.sort(
        (a, b) => b.blockHeight - a.blockHeight
      )[0]

      // If latest is unset, or if we found a later block, update.
      if (
        latestBlock === undefined ||
        latestEvent.blockHeight > latestBlock.height
      ) {
        latestBlock = latestEvent.block
      }
    }

    // Add hook to env so that the getters update the latest block info and next
    // changed block height.
    const dependentKeys = new Set<string>()
    const env = getEnv(
      targetContract.address,
      block,
      args,
      dependentKeys,
      async (events, keyFilter) => {
        await updateLatestBlock(events)
        await updateNextChangedBlock(targetContract.address, keyFilter)
      }
    )

    const value = await formula(env)

    return {
      nextPotentialBlock,
      latestBlock,
      value,
      dependentKeys: Array.from(dependentKeys),
    }
  }

  const results: ComputationOutput[] = []

  // Start at the beginning block and compute the value. Each computation will
  // return with its value and the next block that may change the result. We can
  // then start at that block and compute again. We repeat this until we reach
  // the end block.
  let nextPotentialBlock = blockStart
  while (nextPotentialBlock.height <= blockEnd.height) {
    const result = await computeForBlockInRange(nextPotentialBlock)

    const previousResult = results[results.length - 1]
    // Only store result if it's the first result or different from the most
    // recently stored result.
    if (!previousResult || result.value !== previousResult.value) {
      results.push({
        block: result.latestBlock,
        value: result.value,
        dependentKeys: result.dependentKeys,
      })
    }

    // If no future block may change the result, stop.
    if (result.nextPotentialBlock === undefined) {
      break
    }

    nextPotentialBlock = result.nextPotentialBlock
  }

  return results
}
