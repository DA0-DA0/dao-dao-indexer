import { ContractFormula } from '@/core'

import {
  openProposals as multipleChoiceOpenProposals,
  passedProposals as multipleChoicePassedProposals,
  proposalCount as multipleChoiceProposalCount,
} from '../proposal/daoProposalMultiple'
import {
  openProposals as singleChoiceOpenProposals,
  passedProposals as singleChoicePassedProposals,
  proposalCount as singleChoiceProposalCount,
} from '../proposal/daoProposalSingle'
import { ProposalResponse } from '../proposal/types'
import { activeProposalModules } from './base'

export type OpenProposal = {
  proposalModuleAddress: string
  proposals: (ProposalResponse<any> & { voted?: boolean })[]
}

// Return open proposals and whether or not the given address voted. If no
// address provided, just return open proposals.
export const openProposals: ContractFormula<
  OpenProposal[] | undefined,
  { address?: string }
> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const proposalModules = await activeProposalModules.compute(env)

    if (!proposalModules) {
      return undefined
    }

    return (
      await Promise.all(
        proposalModules.map(
          async ({ address: proposalModuleAddress, info }) => {
            if (!info) {
              return undefined
            }

            const openProposalsFormula =
              OPEN_PROPOSALS_MAP[info.contract.replace('crates.io:', '')]
            const openProposals = await openProposalsFormula?.compute({
              ...env,
              contractAddress: proposalModuleAddress,
            })

            return (
              openProposals && {
                proposalModuleAddress,
                proposals: openProposals,
              }
            )
          }
        )
      )
    ).filter(Boolean) as OpenProposal[]
  },
}

// Map contract name to open proposal formula.
const OPEN_PROPOSALS_MAP: Record<
  string,
  | ContractFormula<
      (ProposalResponse<any> & { voted?: boolean })[],
      { address?: string }
    >
  | undefined
> = {
  // Single choice
  // V1
  'cw-govmod-single': singleChoiceOpenProposals,
  'cw-proposal-single': singleChoiceOpenProposals,
  // V2
  'cwd-proposal-single': singleChoiceOpenProposals,
  'dao-proposal-single': singleChoiceOpenProposals,

  // Multiple choice
  'cwd-proposal-multiple': multipleChoiceOpenProposals,
  'dao-proposal-multiple': multipleChoiceOpenProposals,
}

export const proposalCount: ContractFormula<number | undefined> = {
  compute: async (env) => {
    const proposalModules = await activeProposalModules.compute(env)
    if (!proposalModules) {
      return undefined
    }

    // Get proposal count for each proposal module.
    const proposalCounts = await Promise.all(
      proposalModules.map(async ({ address: proposalModuleAddress, info }) => {
        if (!info) {
          return 0
        }

        const proposalCountFormula =
          PROPOSAL_COUNT_MAP[info.contract.replace('crates.io:', '')]
        const proposalCount = await proposalCountFormula?.compute({
          ...env,
          contractAddress: proposalModuleAddress,
        })

        return proposalCount ?? 0
      })
    )

    // Sum.
    return proposalCounts.reduce((a, b) => a + b)
  },
}

// Map contract name to proposal count formula.
const PROPOSAL_COUNT_MAP: Record<string, ContractFormula<number> | undefined> =
  {
    // Single choice
    // V1
    'cw-govmod-single': singleChoiceProposalCount,
    'cw-proposal-single': singleChoiceProposalCount,
    // V2
    'cwd-proposal-single': singleChoiceProposalCount,
    'dao-proposal-single': singleChoiceProposalCount,

    // Multiple choice
    'cwd-proposal-multiple': multipleChoiceProposalCount,
    'dao-proposal-multiple': multipleChoiceProposalCount,
  }

export const passedProposals: ContractFormula<
  ProposalResponse<any>[] | undefined
> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const proposalModules = await activeProposalModules.compute(env)
    if (!proposalModules) {
      return undefined
    }

    // Get passed proposals for each proposal module.
    const passedProposals = await Promise.all(
      proposalModules.map(async ({ address: proposalModuleAddress, info }) => {
        if (!info) {
          return []
        }

        const passedProposalsFormula =
          PASSED_PROPOSALS_MAP[info.contract.replace('crates.io:', '')]

        return (
          (await passedProposalsFormula?.compute({
            ...env,
            contractAddress: proposalModuleAddress,
          })) ?? []
        )
      })
    )

    return passedProposals.flat()
  },
}

// Map contract name to passed proposals formula.
const PASSED_PROPOSALS_MAP: Record<
  string,
  ContractFormula<ProposalResponse<any>[]> | undefined
> = {
  // Single choice
  // V1
  'cw-govmod-single': singleChoicePassedProposals,
  'cw-proposal-single': singleChoicePassedProposals,
  // V2
  'cwd-proposal-single': singleChoicePassedProposals,
  'dao-proposal-single': singleChoicePassedProposals,

  // Multiple choice
  'cwd-proposal-multiple': multipleChoicePassedProposals,
  'dao-proposal-multiple': multipleChoicePassedProposals,
}
