import { Op } from 'sequelize'

import { Contract, Event } from '../db/models'
import { Env, Formula, FormulaGetter } from './types'
import { dbKeyForKeys, dbKeyToString } from './utils'

export const computeFormula = async (
  formula: Formula,
  targetContract: Contract,
  blockHeight?: number
): Promise<any> => {
  const get: FormulaGetter = async (contractAddress, ...keys) => {
    const key = dbKeyForKeys(...keys)
    // Most recent event at or below this block height.
    const blockHeightFilter = blockHeight
      ? {
          blockHeight: {
            [Op.lte]: blockHeight,
          },
        }
      : {}

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

      // If no events found, return null.
      if (!events.length) {
        return null
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

  const env: Env = {
    contractAddress: targetContract.address,
    get,
  }

  return await formula(env)
}
