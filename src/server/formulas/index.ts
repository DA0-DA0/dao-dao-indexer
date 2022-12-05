import { Formula } from '../types'
import * as common from './common'
import * as daoCore from './daoCore'
import * as daoProposalSingle from './daoProposalSingle'

export const formulas = {
  ...common,
  daoCore,
  daoProposalSingle,
}

export const getFormula = (formulaName: string[]): Formula | undefined =>
  formulaName.reduce((acc, key) => acc && acc[key], formulas)
