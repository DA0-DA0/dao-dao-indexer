import { Op } from 'sequelize'

import { Contract, Event } from '../db/models'
import {
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
  blockHeight?: number
): Promise<any> => {
  const env = getEnv(targetContract.address, args, blockHeight)
  return await formula(env)
}

export const computeRange = async (
  formula: Formula,
  targetContract: Contract,
  args: Record<string, any>,
  blockHeightStart: number,
  blockHeightEnd: number
): Promise<any[]> => {
  const computeForBlockInRange = async (
    blockHeight: number
  ): Promise<{
    nextPotentialBlockHeight: number | undefined
    value: any
  }> => {
    // Store the next block height that has the potential to change the result.
    // Each getter below will update this value if it finds a key change event
    // after the current blockHeight we're computing. If it remains undefined,
    // then we know that the result will not change because no inputs changed.
    let nextPotentialBlockHeight: number | undefined

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

      if (nextEvent) {
        nextPotentialBlockHeight =
          nextPotentialBlockHeight === undefined
            ? Number(nextEvent.blockHeight)
            : Math.min(nextPotentialBlockHeight, Number(nextEvent.blockHeight))
      }
    }

    // Wrap env getters so that they update the next changed block height.
    const env = getEnv(targetContract.address, args, blockHeight)

    const _get = env.get
    env.get = async (contractAddress, ...keys) => {
      const key = dbKeyForKeys(...keys)
      await updateNextChangedBlockHeight(contractAddress, key)

      return await _get<any>(contractAddress, ...keys)
    }

    const _getMap = env.getMap
    env.getMap = async (contractAddress, name, options) => {
      const keyPrefix =
        (Array.isArray(name)
          ? dbKeyForKeys(...name, '')
          : dbKeyForKeys(name, '')) + ','
      await updateNextChangedBlockHeight(contractAddress, {
        [Op.like]: `${keyPrefix}%`,
      })

      return await _getMap(contractAddress, name, options)
    }

    const _getDateKeyModified = env.getDateKeyModified
    env.getDateKeyModified = async (contractAddress, ...keys) => {
      const key = dbKeyForKeys(...keys)
      await updateNextChangedBlockHeight(contractAddress, key)

      return await _getDateKeyModified(contractAddress, ...keys)
    }

    const _getDateKeyFirstSet = env.getDateKeyFirstSet
    env.getDateKeyFirstSet = async (contractAddress, ...keys) => {
      const key = dbKeyForKeys(...keys)
      await updateNextChangedBlockHeight(contractAddress, key)

      return await _getDateKeyFirstSet(contractAddress, ...keys)
    }

    const value = await formula(env)

    return {
      nextPotentialBlockHeight,
      value,
    }
  }

  const results: {
    blockHeight: number
    value: any
  }[] = []

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
        blockHeight: nextPotentialBlockHeight,
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
  blockHeight?: number
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

    // If no event found or key was deleted, return undefined.
    if (!event || event.delete) {
      return undefined
    }

    return JSON.parse(event.value)
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
    const events = await Event.findAll({
      where: {
        contractAddress,
        key: {
          [Op.like]: `${keyPrefix}%`,
        },
        // Most recent event at or below this block height.
        ...blockHeightFilter,
      },
      order: [['blockHeight', 'DESC']],
    })

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

      map[mapKey] = JSON.parse(event.value)
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
