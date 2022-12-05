import { Formula } from '../types'
import * as common from './common'
import * as cw20 from './cw20'
import * as daoCore from './daoCore'
import * as daoProposalSingle from './daoProposalSingle'
import * as daoVotingCw20Staked from './daoVotingCw20Staked'
import * as daoVotingCw4 from './daoVotingCw4'

export const formulas = {
  ...common,
  cw20,
  daoCore,
  daoProposalSingle,
  daoVotingCw20Staked,
  daoVotingCw4,
}

export const getFormula = (formulaName: string[]): Formula<any> | undefined =>
  formulaName.reduce((acc, key) => acc && acc[key], formulas)
