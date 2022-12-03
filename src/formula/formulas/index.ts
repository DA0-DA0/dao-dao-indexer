import { Op } from 'sequelize'

import { Contract, Event } from '../../db/models'
import { Formula, FormulaGetter } from '../types'
import { base64KeyForKeys } from '../utils'
import * as dao from './dao'

export const formulas = {
  dao,
}

export const getFormula = (formulaName: string[]): Formula | undefined =>
  formulaName.reduce((acc, key) => acc && acc[key], formulas)

export const compute = async (
  formula: Formula,
  targetContract: Contract,
  blockHeight?: number
): Promise<any> => {
  const get: FormulaGetter = async (contractAddress, ...keys) => {
    const key = base64KeyForKeys(...keys)
    const event = await Event.findOne({
      where: {
        contractAddress,
        key,
        // Most recent event at or below this block height.
        ...(blockHeight
          ? {
              blockHeight: {
                [Op.lte]: blockHeight,
              },
            }
          : {}),
      },
      order: [
        ['blockHeight', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    })

    if (!event) {
      return undefined
    }

    return JSON.parse(Buffer.from(event.value, 'base64').toString('utf-8'))
  }

  return await formula(targetContract.address, get)
}
