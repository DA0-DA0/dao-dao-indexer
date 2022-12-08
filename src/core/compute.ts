import { Op } from 'sequelize'

import { Contract, Event } from '../db/models'
import {
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
  blockHeight?: bigint
): Promise<ComputationOutput> => {
  // Store the latest block height and time that we've seen for all keys
  // accessed. This is the earliest this computation could have been made.
  let latestBlockHeight: bigint | undefined
  let latestBlockTimeUnixMicro: bigint | undefined

  const updateLatestBlock = async (events: Event[]) => {
    if (events.length === 0) {
      return
    }

    const latestEvent = events.sort((a, b) =>
      Number(b.blockHeight - a.blockHeight)
    )[0]

    // If latest is unset, or if we found a later block height, update.
    if (
      latestBlockHeight === undefined ||
      latestEvent.blockHeight > latestBlockHeight
    ) {
      latestBlockHeight = latestEvent.blockHeight
      latestBlockTimeUnixMicro = latestEvent.blockTimeUnixMicro
    }
  }

  const env = getEnv(
    targetContract.address,
    args,
    blockHeight,
    updateLatestBlock
  )

  const value = await formula(env)

  return {
    blockHeight: latestBlockHeight ?? BigInt(-1),
    blockTimeUnixMicro: latestBlockTimeUnixMicro ?? BigInt(-1),
    value,
  }
}

export const computeRange = async (
  formula: Formula,
  targetContract: Contract,
  args: Record<string, any>,
  blockHeightStart: bigint,
  blockHeightEnd: bigint
): Promise<ComputationOutput[]> => {
  const computeForBlockInRange = async (
    blockHeight: bigint
  ): Promise<{
    nextPotentialBlockHeight: bigint | undefined
    latestBlockHeight: bigint | undefined
    latestBlockTimeUnixMicro: bigint | undefined
    value: any
  }> => {
    // Store the next block height that has the potential to change the result.
    // Each getter below will update this value if it finds a key change event
    // after the current blockHeight we're computing. If it remains undefined,
    // then we know that the result will not change because no inputs changed.
    let nextPotentialBlockHeight: bigint | undefined

    // Find the next event that may change the result for the given key filter
    // and update accordingly. Ignore any events after the end block height.
    const updateNextChangedBlockHeight = async (
      contractAddress: string,
      keyFilter: string | object
    ) => {
      const nextEvent = await Event.findOne({
        where: {
          contractAddress,
          key: keyFilter,
          // After the current block height and at or before the end.
          blockHeight: {
            [Op.gt]: blockHeight,
            [Op.lte]: blockHeightEnd,
          },
        },
        order: [['blockHeight', 'ASC']],
      })

      // If we found an event, and it's earlier than the current next potential
      // block height (or if we haven't found one yet), update.
      if (
        nextEvent &&
        (nextPotentialBlockHeight === undefined ||
          nextEvent.blockHeight < nextPotentialBlockHeight)
      ) {
        nextPotentialBlockHeight = nextEvent.blockHeight
      }
    }

    // Store the latest block height and time that we've seen for all keys
    // accessed. This is the earliest this computation could have been made.
    let latestBlockHeight: bigint | undefined
    let latestBlockTimeUnixMicro: bigint | undefined

    const updateLatestBlock = async (events: Event[]) => {
      if (events.length === 0) {
        return
      }

      const latestEvent = events.sort((a, b) =>
        Number(b.blockHeight - a.blockHeight)
      )[0]

      // If latest is unset, or if we found a later block height, update.
      if (
        latestBlockHeight === undefined ||
        latestEvent.blockHeight > latestBlockHeight
      ) {
        latestBlockHeight = latestEvent.blockHeight
        latestBlockTimeUnixMicro = latestEvent.blockTimeUnixMicro
      }
    }

    // Add hook to env so that the getters update the latest block info and next
    // changed block height.
    const env = getEnv(
      targetContract.address,
      args,
      blockHeight,
      async (events, keyFilter) => {
        await updateLatestBlock(events)
        await updateNextChangedBlockHeight(targetContract.address, keyFilter)
      }
    )

    const value = await formula(env)

    return {
      nextPotentialBlockHeight,
      latestBlockHeight,
      latestBlockTimeUnixMicro,
      value,
    }
  }

  const results: ComputationOutput[] = []

  // Start at the beginning block height and compute the value. Each computation
  // will return with its value and the next block height that may change the
  // result. We can then start at that block height and compute again. We repeat
  // this until we reach the end block height.
  let nextPotentialBlockHeight = blockHeightStart
  while (nextPotentialBlockHeight <= blockHeightEnd) {
    const result = await computeForBlockInRange(nextPotentialBlockHeight)

    const previousResult = results[results.length - 1]
    // Only store result if it's the first result or different from the most
    // recently stored result.
    if (!previousResult || result.value !== previousResult.value) {
      results.push({
        blockHeight: result.latestBlockHeight ?? BigInt(-1),
        blockTimeUnixMicro: result.latestBlockTimeUnixMicro ?? BigInt(-1),
        value: result.value,
      })
    }

    // If no future block height may change the result, stop.
    if (result.nextPotentialBlockHeight === undefined) {
      break
    }

    nextPotentialBlockHeight = result.nextPotentialBlockHeight
  }

  return results
}

// Generate environment for computation.
const getEnv = (
  contractAddress: string,
  args: Record<string, any>,
  blockHeight?: bigint,
  onFetchEvents?: (
    events: Event[],
    keyFilter: string | object
  ) => void | Promise<void>
): Env<{}> => {
  // Most recent event at or below this block height.
  const blockHeightFilter = blockHeight
    ? {
        blockHeight: {
          [Op.lte]: blockHeight,
        },
      }
    : {}

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
        // Most recent event at or below this block height.
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
    date.setUTCSeconds(Number(event.blockTimeUnixMicro) / 1e6)
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
    date.setUTCSeconds(Number(event.blockTimeUnixMicro) / 1e6)
    return date
  }

  return {
    contractAddress,
    get,
    getMap,
    getDateKeyModified,
    getDateKeyFirstSet,
    args,
  }
}
