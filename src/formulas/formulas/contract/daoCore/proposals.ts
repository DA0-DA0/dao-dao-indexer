import { loadConfig } from '@/config'
import { ContractFormula } from '@/types'

import {
  listProposals as multipleChoiceListProposals,
  openProposals as multipleChoiceOpenProposals,
  proposalCount as multipleChoiceProposalCount,
} from '../proposal/daoProposalMultiple'
import {
  listProposals as singleChoiceListProposals,
  openProposals as singleChoiceOpenProposals,
  proposalCount as singleChoiceProposalCount,
} from '../proposal/daoProposalSingle'
import { ListProposalFilter, ProposalResponse } from '../proposal/types'
import { activeProposalModules } from './base'
import { getUniqueSubDaosInTree } from './utils'

export type OpenProposal = {
  proposalModuleAddress: string
  prefix: string
  proposals: (ProposalResponse<any> & {
    url: string
    voted?: boolean
  })[]
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
    const { daoDaoBase } = loadConfig()
    const proposalModules = await activeProposalModules.compute(env)

    if (!proposalModules) {
      return undefined
    }

    return (
      await Promise.all(
        proposalModules.map(
          async ({ address: proposalModuleAddress, info, prefix }) => {
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
                prefix,
                proposals: openProposals.map((proposal) => ({
                  url:
                    daoDaoBase +
                    `/dao/${env.contractAddress}/proposals/${prefix}${proposal.id}`,
                  ...proposal,
                })),
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
  // Neutron
  'cwd-subdao-proposal-single': singleChoiceOpenProposals,

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
    // Neutron
    'cwd-subdao-proposal-single': singleChoiceProposalCount,

    // Multiple choice
    'cwd-proposal-multiple': multipleChoiceProposalCount,
    'dao-proposal-multiple': multipleChoiceProposalCount,
  }

type Proposal = ProposalResponse<any> & {
  coreAddress: string
  proposalModuleAddress: string
}

export const allProposals: ContractFormula<
  Proposal[] | undefined,
  {
    filter?: ListProposalFilter
    // Whether or not to recurse into SubDAOs. Defaults to true. `true` or `1`
    // means recurse, anything else means don't recurse.
    recursive?: string
  }
> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const daos = [
      env.contractAddress,
      // Add SubDAOs if `recursive` is enabled.
      ...(!('recursive' in env.args) ||
      env.args.recursive === 'true' ||
      env.args.recursive === '1'
        ? await getUniqueSubDaosInTree(env, env.contractAddress)
        : []),
    ]

    const all: Proposal[] = []

    for (const dao of daos) {
      const proposalModules =
        (await activeProposalModules.compute({
          ...env,
          contractAddress: dao,
        })) ?? []

      // Get proposals for each proposal module and filter.
      const proposals = await Promise.all(
        proposalModules.map(
          async ({ address: proposalModuleAddress, info }) => {
            if (!info) {
              return []
            }

            const listProposalsFormula =
              LIST_PROPOSALS_MAP[info.contract.replace('crates.io:', '')]
            const proposals =
              (await listProposalsFormula?.compute({
                ...env,
                contractAddress: proposalModuleAddress,
              })) ?? []

            return proposals.map(
              (proposal): Proposal => ({
                coreAddress: dao,
                proposalModuleAddress,
                ...proposal,
              })
            )
          }
        )
      )

      all.push(...proposals.flat())
    }

    return all
  },
}

// Map contract name to list proposals formula.
const LIST_PROPOSALS_MAP: Record<
  string,
  | ContractFormula<ProposalResponse<any>[], { filter?: ListProposalFilter }>
  | undefined
> = {
  // Single choice
  // V1
  'cw-govmod-single': singleChoiceListProposals,
  'cw-proposal-single': singleChoiceListProposals,
  // V2
  'cwd-proposal-single': singleChoiceListProposals,
  'dao-proposal-single': singleChoiceListProposals,
  // Neutron
  'cwd-subdao-proposal-single': singleChoiceListProposals,

  // Multiple choice
  'cwd-proposal-multiple': multipleChoiceListProposals,
  'dao-proposal-multiple': multipleChoiceListProposals,
}

// Get date of most recent proposal event, either completion or creation.
export const lastActivity: ContractFormula<string | undefined> = {
  compute: async (env) => {
    const lastProposalAction = ((await allProposals.compute(env)) ?? [])
      .map(({ createdAt, completedAt }) =>
        completedAt
          ? Date.parse(completedAt)
          : createdAt
          ? Date.parse(createdAt)
          : null
      )
      .filter(Boolean)
      .sort()
      .pop()

    return lastProposalAction
      ? new Date(lastProposalAction).toISOString()
      : undefined
  },
}
