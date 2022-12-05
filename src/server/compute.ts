import { Op } from 'sequelize'

import { Contract, Event } from '../db/models'
import { Env, Formula, FormulaDateGetter, FormulaGetter } from './types'
import { dbKeyForKeys, dbKeyToString } from './utils'

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

    // If no event found, this may be referring to an entire map. If so, find
    // the values for all keys in the map.
    if (!event) {
      const keyPrefix = dbKeyForKeys(...keys, '') + ','
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

      // If no events found, return undefined.
      if (!events.length) {
        return undefined
      }

      // If events found, return map of key to value.
      const map: Record<string, any> = {}
      for (const event of events) {
        // Remove prefix from key and convert to utf-8.
        const mapKey = dbKeyToString(event.key.slice(keyPrefix.length))
        map[mapKey] = JSON.parse(event.value)
      }
      return map
    }

    return JSON.parse(event.value)
  }

  const getCreatedAt: FormulaDateGetter = async (contractAddress, ...keys) => {
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

    if (!event) {
      return undefined
    }

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(event.blockTimeUnixMicro) / 1e6)
    return date
  }

  const env: Env = {
    contractAddress: targetContract.address,
    get,
    getCreatedAt,
    args,
  }

  return await formula(env)
}
