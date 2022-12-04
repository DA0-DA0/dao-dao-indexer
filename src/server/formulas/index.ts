import { Formula } from '../types'
import * as common from './common'
import * as dao from './dao'
import * as daoProposalSingle from './daoProposalSingle'

export const formulas = {
  ...common,
  dao,
  daoProposalSingle,
}

export const getFormula = (formulaName: string[]): Formula | undefined =>
  formulaName.reduce((acc, key) => acc && acc[key], formulas)
