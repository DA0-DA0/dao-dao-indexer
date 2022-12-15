import { Op } from 'sequelize'

import { Contract, Event } from '../db/models'
import {
  Block,
  ComputationOutput,
  Env,
  Formula,
  FormulaDateGetter,
  FormulaGetter,
  FormulaMapGetter,
} from './types'
import { dbKeyForKeys, dbKeyToNumber, dbKeyToString } from './utils'

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
      latestBlock = {
        height: latestEvent.blockHeight,
        timeUnixMs: latestEvent.blockTimeUnixMs,
      }
    }
  }

  const env = getEnv(targetContract.address, block, args, updateLatestBlock)

  const value = await formula(env)

  return {
    block: latestBlock,
    value,
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
        nextPotentialBlock = {
          height: nextEvent.blockHeight,
          timeUnixMs: nextEvent.blockTimeUnixMs,
        }
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
        latestBlock = {
          height: latestEvent.blockHeight,
          timeUnixMs: latestEvent.blockTimeUnixMs,
        }
      }
    }

    // Add hook to env so that the getters update the latest block info and next
    // changed block height.
    const env = getEnv(
      targetContract.address,
      block,
      args,
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

// Generate environment for computation.
const getEnv = (
  contractAddress: string,
  block: Block,
  args: Record<string, any>,
  onFetchEvents?: (
    events: Event[],
    keyFilter: string | object
  ) => void | Promise<void>
): Env<{}> => {
  // Most recent event at or below this block.
  const blockHeightFilter = {
    blockHeight: {
      [Op.lte]: block.height,
    },
  }

  const get: FormulaGetter = async (contractAddress, ...keys) => {
    const key = dbKeyForKeys(...keys)
    const event = await Event.findOne({
      where: {
        contractAddress,
        key,
        ...blockHeightFilter,
      },
      order: [['blockHeight', 'DESC']],
    })

    // Call hook.
    await onFetchEvents?.(event ? [event] : [], key)

    // If no event found or key was deleted, return undefined.
    if (!event || event.delete) {
      return undefined
    }

    return JSON.parse(event.value ?? 'null')
  }

  const getMap: FormulaMapGetter = async (
    contractAddress,
    name,
    { numericKeys = false } = {}
  ) => {
    const keyPrefix =
      (Array.isArray(name)
        ? dbKeyForKeys(...name, '')
        : dbKeyForKeys(name, '')) + ','
    const keyFilter = {
      [Op.like]: `${keyPrefix}%`,
    }
    const events = await Event.findAll({
      where: {
        contractAddress,
        key: keyFilter,
        ...blockHeightFilter,
      },
      order: [['blockHeight', 'DESC']],
    })

    // Call hook.
    await onFetchEvents?.(events, keyFilter)

    // If no events found, return empty map.
    if (!events.length) {
      return undefined
    }

    // Remove delete events.
    const undeletedEvents = events.filter((event) => !event.delete)

    // If events found, create map.
    const map: Record<string | number, any> = {}
    for (const event of undeletedEvents) {
      // Remove prefix from key and convert to expected format.
      const mapKey = numericKeys
        ? dbKeyToNumber(event.key.slice(keyPrefix.length))
        : dbKeyToString(event.key.slice(keyPrefix.length))

      map[mapKey] = JSON.parse(event.value ?? 'null')
    }

    return map
  }

  // Gets the date of the most recent event for the given key.
  const getDateKeyModified: FormulaDateGetter = async (
    contractAddress,
    ...keys
  ) => {
    const key = dbKeyForKeys(...keys)
    // Get most recent event for this key.
    const event = await Event.findOne({
      where: {
        contractAddress,
        key,
        ...blockHeightFilter,
      },
      order: [['blockHeight', 'DESC']],
    })

    // Call hook.
    await onFetchEvents?.(event ? [event] : [], key)

    if (!event) {
      return undefined
    }

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(event.blockTimeUnixMs) / 1e3)
    return date
  }

  // Gets the date of the first set event for the given key.
  const getDateKeyFirstSet: FormulaDateGetter = async (
    contractAddress,
    ...keys
  ) => {
    const key = dbKeyForKeys(...keys)
    // Get first set event for this key.
    const event = await Event.findOne({
      where: {
        contractAddress,
        key,
        delete: false,
        ...blockHeightFilter,
      },
      order: [['blockHeight', 'ASC']],
    })

    // Call hook.
    await onFetchEvents?.(event ? [event] : [], key)

    if (!event) {
      return undefined
    }

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(event.blockTimeUnixMs) / 1e3)
    return date
  }

  return {
    contractAddress,
    block,
    get,
    getMap,
    getDateKeyModified,
    getDateKeyFirstSet,
    args,
  }
}
