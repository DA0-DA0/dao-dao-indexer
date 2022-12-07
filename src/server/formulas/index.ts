import { Formula } from '../types'
import * as common from './common'
import * as cw20 from './cw20'
import * as cw4Group from './cw4Group'
import * as cw721 from './cw721'
import * as daoCore from './daoCore'
import * as cwTokenSwap from './external/cwTokenSwap'
import * as daoPreProposeApprovalSingle from './prePropose/daoPreProposeApprovalSingle'
import * as daoPreProposeApprover from './prePropose/daoPreProposeApprover'
import * as daoPreProposeMultiple from './prePropose/daoPreProposeMultiple'
import * as daoPreProposeSingle from './prePropose/daoPreProposeSingle'
import * as daoProposalMultiple from './proposal/daoProposalMultiple'
import * as daoProposalSingle from './proposal/daoProposalSingle'
import * as cw20Stake from './staking/cw20Stake'
import * as daoVotingCw20Staked from './voting/daoVotingCw20Staked'
import * as daoVotingCw4 from './voting/daoVotingCw4'
import * as daoVotingCw721Staked from './voting/daoVotingCw721Staked'
import * as daoVotingNativeStaked from './voting/daoVotingNativeStaked'
import * as daoVotingStakingDenomStaked from './voting/daoVotingStakingDenomStaked'

type NestedFormulaMap = {
  [key: string]: Formula<any, any> | NestedFormulaMap | undefined
}

export const formulas: NestedFormulaMap = {
  ...common,
  cw20,
  cw20Stake,
  cw4Group,
  cw721,
  cwTokenSwap,
  daoCore,
  daoPreProposeApprovalSingle,
  daoPreProposeApprover,
  daoPreProposeMultiple,
  daoPreProposeSingle,
  daoProposalMultiple,
  daoProposalSingle,
  daoVotingCw20Staked,
  daoVotingCw4,
  daoVotingCw721Staked,
  daoVotingNativeStaked,
  daoVotingStakingDenomStaked,
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
