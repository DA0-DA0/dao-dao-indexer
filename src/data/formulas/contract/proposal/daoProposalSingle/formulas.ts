import { Op } from 'sequelize'

import { ContractEnv, ContractFormula } from '@/core'

import { isExpirationExpired } from '../../../utils'
import { ProposalResponse, Status, VoteInfo } from '../types'
import { isPassed, isRejected } from './status'
import { Ballot, SingleChoiceProposal } from './types'

export const config: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    (await get(contractAddress, 'config_v2')) ??
    (await get(contractAddress, 'config')),
}

export const dao: ContractFormula<string | undefined> = {
  compute: async (env) => (await config.compute(env))?.dao,
}

export const proposal: ContractFormula<
  ProposalResponse<SingleChoiceProposal> | undefined,
  { id: string }
> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const {
      contractAddress,
      getTransformationMatch,
      args: { id },
    } = env

    const idNum = Number(id)
    const proposal = (
      await getTransformationMatch<SingleChoiceProposal>(
        contractAddress,
        `proposal:${id}`
      )
    )?.value

    return proposal && intoResponse(env, proposal, idNum)
  },
}

export const creationPolicy: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'creation_policy'),
}

export const listProposals: ContractFormula<
  ProposalResponse<SingleChoiceProposal>[],
  {
    limit?: string
    startAfter?: string
  }
> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const {
      contractAddress,
      getTransformationMap,
      args: { limit, startAfter },
    } = env

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
    const startAfterNum = startAfter
      ? Math.max(0, Number(startAfter))
      : -Infinity

    const proposals =
      (await getTransformationMap<number, SingleChoiceProposal>(
        contractAddress,
        'proposal'
      )) ?? {}

    const proposalIds = Object.keys(proposals)
      .map(Number)
      // Ascending by proposal ID.
      .sort((a, b) => a - b)
      .filter((id) => id > startAfterNum)
      .slice(0, limitNum)

    const proposalResponses = await Promise.all(
      proposalIds.map((id) => intoResponse(env, proposals[id], id))
    )

    return proposalResponses
  },
}

export const reverseProposals: ContractFormula<
  ProposalResponse<SingleChoiceProposal>[],
  {
    limit?: string
    startBefore?: string
  }
> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const {
      contractAddress,
      getTransformationMap,
      args: { limit, startBefore },
    } = env

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
    const startBeforeNum = startBefore
      ? Math.max(0, Number(startBefore))
      : Infinity

    const proposals =
      (await getTransformationMap<number, SingleChoiceProposal>(
        contractAddress,
        'proposal'
      )) ?? {}

    const proposalIds = Object.keys(proposals)
      .map(Number)
      // Descending by proposal ID.
      .sort((a, b) => b - a)
      .filter((id) => id < startBeforeNum)
      .slice(0, limitNum)

    const proposalResponses = await Promise.all(
      proposalIds.map((id) => intoResponse(env, proposals[id], id))
    )

    return proposalResponses
  },
}

export const proposalCount: ContractFormula<number> = {
  compute: async ({ contractAddress, get }) =>
    // V1 may have no proposal_count set, so default to 0.
    (await get(contractAddress, 'proposal_count')) ?? 0,
}

export const nextProposalId: ContractFormula<number> = {
  compute: async (env) => (await proposalCount.compute(env)) + 1,
}

// TODO: Use transformed.
export const vote: ContractFormula<
  VoteInfo<Ballot> | undefined,
  { proposalId: string; voter: string }
> = {
  compute: async ({
    contractAddress,
    get,
    getDateKeyModified,
    args: { proposalId, voter },
  }) => {
    if (!proposalId) {
      throw new Error('missing `proposalId`')
    }
    if (!voter) {
      throw new Error('missing `voter`')
    }

    const ballot = await get<Ballot>(
      contractAddress,
      'ballots',
      Number(proposalId),
      voter
    )
    if (!ballot) {
      return
    }

    const votedAt = (
      await getDateKeyModified(
        contractAddress,
        'ballots',
        Number(proposalId),
        voter
      )
    )?.toISOString()

    return {
      voter,
      ...ballot,
      votedAt,
    }
  },
}

// TODO: Use transformed.
export const listVotes: ContractFormula<
  VoteInfo<Ballot>[],
  {
    proposalId: string
    limit?: string
    startAfter?: string
  }
> = {
  compute: async ({
    contractAddress,
    getMap,
    getDateKeyModified,
    args: { proposalId, limit, startAfter },
  }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const ballots =
      (await getMap<string, Ballot>(contractAddress, [
        'ballots',
        Number(proposalId),
      ])) ?? {}
    const voters = Object.keys(ballots)
      // Ascending by voter address.
      .sort((a, b) => a.localeCompare(b))
      .filter((voter) => !startAfter || voter.localeCompare(startAfter) > 0)
      .slice(0, limitNum)

    const votesCastAt = await Promise.all(
      voters.map((voter) =>
        getDateKeyModified(
          contractAddress,
          'ballots',
          Number(proposalId),
          voter
        )
      )
    )

    return voters.map((voter, index) => ({
      voter,
      ...ballots[voter],
      votedAt: votesCastAt[index]?.toISOString(),
    }))
  },
}

export const proposalCreatedAt: ContractFormula<
  string | undefined,
  { id: string }
> = {
  compute: async ({ contractAddress, getDateFirstTransformed, args: { id } }) =>
    (
      await getDateFirstTransformed(contractAddress, `proposal:${id}`)
    )?.toISOString(),
}

// Return open proposals. If an address is passed, returns only proposals with
// no votes from the address.
export const openProposals: ContractFormula<
  ProposalResponse<SingleChoiceProposal>[],
  { address?: string }
> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const openProposals = (
      await listProposals.compute({
        ...env,
        args: {},
      })
    ).filter(({ proposal }) => proposal.status === Status.Open)

    // Get votes for the given address for each open proposal. If no address,
    // don't filter by vote.
    const openProposalVotes = env.args.address
      ? await Promise.all(
          openProposals.map(({ id }) =>
            vote.compute({
              ...env,
              args: {
                proposalId: id.toString(),
                voter: env.args.address!,
              },
            })
          )
        )
      : undefined

    // Filter out proposals with votes if address provided.
    const openProposalsWithoutVotes =
      env.args.address && openProposalVotes
        ? openProposals.filter((_, index) => !openProposalVotes[index])
        : openProposals

    return openProposalsWithoutVotes
  },
}

// Helpers

// https://github.com/DA0-DA0/dao-contracts/blob/e1f46b48cc72d4e48bf6afcb44432979347e594c/contracts/proposal/dao-proposal-single/src/proposal.rs#L50
const intoResponse = async (
  env: ContractEnv,
  proposal: SingleChoiceProposal,
  id: number
): Promise<ProposalResponse<SingleChoiceProposal>> => {
  // Update status.
  if (proposal.status === Status.Open) {
    if (isPassed(proposal, env.block)) {
      proposal.status = Status.Passed
    } else if (
      isExpirationExpired(proposal.expiration, env.block) ||
      isRejected(proposal, env.block)
    ) {
      proposal.status = Status.Rejected
    }
  }

  const createdAt = await proposalCreatedAt.compute({
    ...env,
    args: {
      id: id.toString(),
    },
  })

  let executedAt: string | undefined
  if (
    proposal.status === Status.Executed ||
    proposal.status === Status.ExecutionFailed
  ) {
    executedAt = (
      await env.getDateFirstTransformed(env.contractAddress, `proposal:${id}`, {
        status: {
          [Op.in]: ['executed', 'execution_failed'],
        },
      })
    )?.toISOString()
  }

  let closedAt: string | undefined
  if (proposal.status === Status.Closed) {
    closedAt = (
      await env.getDateFirstTransformed(env.contractAddress, `proposal:${id}`, {
        status: 'closed',
      })
    )?.toISOString()
  }

  let completedAt: string | undefined
  if (proposal.status !== Status.Open) {
    completedAt =
      executedAt ||
      closedAt ||
      // If not yet executed nor closed, completed when it was passed/rejected.
      (
        await env.getDateFirstTransformed(
          env.contractAddress,
          `proposal:${id}`,
          {
            status: {
              [Op.in]: ['passed', 'rejected'],
            },
          }
        )
      )?.toISOString()
  }

  return {
    id,
    proposal,
    // Extra.
    createdAt,
    completedAt,
    executedAt,
    closedAt,
  }
}
