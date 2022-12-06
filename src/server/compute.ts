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

export const computeFormula = async (
  formula: Formula<any>,
  targetContract: Contract,
  args: Record<string, any>,
  blockHeight?: number
): Promise<any> => {
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
      order: [
        ['blockHeight', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    })

    // If no event found, return undefined.
    if (!event) {
      return undefined
    }

    return JSON.parse(event.value)
  }

  const getMap: FormulaMapGetter = async (
    contractAddress,
    name,
    { numericKeys = false } = {}
  ) => {
    const keyPrefix = dbKeyForKeys(name, '') + ','
    const events = await Event.findAll({
      where: {
        contractAddress,
        key: {
          [Op.like]: `${keyPrefix}%`,
        },
        // Most recent event at or below this block height.
        ...blockHeightFilter,
      },
      order: [
        ['blockHeight', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    })

    // If no events found, return empty map.
    if (!events.length) {
      return undefined
    }

    // If events found, create map.
    const map: Record<string | number, any> = {}
    for (const event of events) {
      // Remove prefix from key and convert to expected format.
      const mapKey = numericKeys
        ? dbKeyToNumber(event.key.slice(keyPrefix.length))
        : dbKeyToString(event.key.slice(keyPrefix.length))

      map[mapKey] = JSON.parse(event.value)
    }

    return map
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
      order: [
        ['blockHeight', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    })

    if (!event) {
      return undefined
    }

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(event.blockTimeUnixMicro) / 1e6)
    return date
  }

  const env: Env<{}> = {
    contractAddress: targetContract.address,
    get,
    getMap,
    getDateKeyFirstSet,
    args,
  }

  return await formula(env)
}
