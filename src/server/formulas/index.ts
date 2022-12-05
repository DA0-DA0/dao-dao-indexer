import { Formula } from '../types'
import * as common from './common'
import * as cw20 from './cw20'
import * as daoCore from './daoCore'
import * as daoProposalSingle from './daoProposalSingle'

export const formulas = {
  ...common,
  cw20,
  daoCore,
  daoProposalSingle,
}

export const getFormula = (formulaName: string[]): Formula<any> | undefined =>
  formulaName.reduce((acc, key) => acc && acc[key], formulas)
