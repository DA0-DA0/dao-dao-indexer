import { Event } from '../../db/models'
import { Formula } from '../types'
import * as dao from './dao'

export const formulas = {
  dao,
}

export const getFormula = (formulaName: string[]): Formula | undefined =>
  formulaName.reduce((acc, key) => acc && acc[key], formulas)
