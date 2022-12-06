import { Formula } from '../types'
import * as common from './common'
import * as cw20 from './cw20'
import * as cw20Stake from './cw20Stake'
import * as daoCore from './daoCore'
import * as daoProposalSingle from './daoProposalSingle'
import * as daoVotingCw20Staked from './daoVotingCw20Staked'
import * as daoVotingCw4 from './daoVotingCw4'

type NestedFormulaMap = {
  [key: string]: Formula<any, any> | NestedFormulaMap | undefined
}

export const formulas: NestedFormulaMap = {
  ...common,
  cw20,
  cw20Stake,
  daoCore,
  daoProposalSingle,
  daoVotingCw20Staked,
  daoVotingCw4,
}

export const getFormula = (
  formulaPath: string[]
): Formula<any, any> | undefined => {
  const formulaBase = formulaPath
    .slice(0, -1)
    .reduce(
      (acc, key) =>
        typeof acc === 'object' && acc[key] ? acc[key] : undefined,
      formulas as NestedFormulaMap | Formula<any, any> | undefined
    )

  const formula =
    typeof formulaBase === 'object'
      ? formulaBase[formulaPath[formulaPath.length - 1]]
      : undefined
  return typeof formula === 'function' ? formula : undefined
}
