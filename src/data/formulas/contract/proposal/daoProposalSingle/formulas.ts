import { Op } from 'sequelize'

import { ContractEnv, ContractFormula } from '@/core'

import { VoteCast, VoteInfo } from '../../../../types'
import { isExpirationExpired } from '../../../utils'
import { ProposalResponse, Status } from '../types'
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
      get,
      args: { id },
    } = env

    const idNum = Number(id)
    let proposal = (
      await getTransformationMatch<SingleChoiceProposal>(
        contractAddress,
        `proposal:${id}`
      )
    )?.value

    // Fallback to events.
    let v2 = false
    if (!proposal) {
      // V2.
      const proposalV2 = await get<SingleChoiceProposal>(
        contractAddress,
        'proposals_v2',
        idNum
      )
      if (proposalV2) {
        proposal = proposalV2
        v2 = true
      } else {
        // V1.
        proposal = await get<SingleChoiceProposal>(
          contractAddress,
          'proposals',
          idNum
        )
      }
    }

    return proposal && intoResponse(env, proposal, idNum, { v2 })
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
      getMap,
      args: { limit, startAfter },
    } = env

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
    const startAfterNum = startAfter
      ? Math.max(0, Number(startAfter))
      : -Infinity

    let proposals = await getTransformationMap<number, SingleChoiceProposal>(
      contractAddress,
      'proposal'
    )

    // Fallback to events.
    let v2 = false
    if (!proposals) {
      // V2.
      const proposalsV2 = await getMap<number, SingleChoiceProposal>(
        contractAddress,
        'proposals_v2',
        { keyType: 'number' }
      )
      if (proposalsV2) {
        proposals = proposalsV2
        v2 = true
      } else {
        // V1.
        proposals = await getMap<number, SingleChoiceProposal>(
          contractAddress,
          'proposals',
          { keyType: 'number' }
        )
      }
    }

    if (!proposals) {
      return []
    }

    const proposalIds = Object.keys(proposals)
      .map(Number)
      // Ascending by proposal ID.
      .sort((a, b) => a - b)
      .filter((id) => id > startAfterNum)
      .slice(0, limitNum)

    const proposalResponses = await Promise.all(
      proposalIds.map((id) => intoResponse(env, proposals![id], id, { v2 }))
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
      getMap,
      args: { limit, startBefore },
    } = env

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
    const startBeforeNum = startBefore
      ? Math.max(0, Number(startBefore))
      : Infinity

    let proposals = await getTransformationMap<number, SingleChoiceProposal>(
      contractAddress,
      'proposal'
    )

    // Fallback to events.
    let v2 = false
    if (!proposals) {
      // V2.
      const proposalsV2 = await getMap<number, SingleChoiceProposal>(
        contractAddress,
        'proposals_v2',
        { keyType: 'number' }
      )
      if (proposalsV2) {
        proposals = proposalsV2
        v2 = true
      } else {
        // V1.
        proposals = await getMap<number, SingleChoiceProposal>(
          contractAddress,
          'proposals',
          { keyType: 'number' }
        )
      }
    }

    if (!proposals) {
      return []
    }

    const proposalIds = Object.keys(proposals)
      .map(Number)
      // Descending by proposal ID.
      .sort((a, b) => b - a)
      .filter((id) => id < startBeforeNum)
      .slice(0, limitNum)

    const proposalResponses = await Promise.all(
      proposalIds.map((id) => intoResponse(env, proposals![id], id, { v2 }))
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

export const vote: ContractFormula<
  VoteInfo<Ballot> | undefined,
  { proposalId: string; voter: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
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

    let voteCast = (
      await getTransformationMatch<VoteCast<Ballot>>(
        contractAddress,
        `voteCast:${voter}:${proposalId}`
      )
    )?.value

    // Falback to events.
    if (!voteCast) {
      const ballot = await get<Ballot>(
        contractAddress,
        'ballots',
        Number(proposalId),
        voter
      )

      if (ballot) {
        const votedAt = (
          await getDateKeyModified(
            contractAddress,
            'ballots',
            Number(proposalId),
            voter
          )
        )?.toISOString()

        voteCast = {
          voter,
          vote: ballot,
          votedAt,
        }
      }
    }

    return (
      voteCast && {
        voter,
        ...voteCast.vote,
        votedAt: voteCast.votedAt,
      }
    )
  },
}

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
    getTransformationMatches,
    getMap,
    getDateKeyModified,
    args: { proposalId, limit, startAfter },
  }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    let votesCast = (
      await getTransformationMatches<VoteCast<Ballot>>(
        contractAddress,
        `voteCast:*:${proposalId}`
      )
    )?.map(({ value }) => value)

    // Fallback to events.
    if (!votesCast) {
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

      votesCast = voters.map((voter, index) => ({
        voter,
        vote: ballots[voter],
        votedAt: votesCastAt[index]?.toISOString(),
      }))
    } else {
      // Ascending by voter address.
      votesCast = votesCast
        .sort((a, b) => a.voter.localeCompare(b.voter))
        .filter(
          ({ voter }) => !startAfter || voter.localeCompare(startAfter) > 0
        )
        .slice(0, limitNum)
    }

    return votesCast.map(
      ({ voter, vote, votedAt }): VoteInfo<Ballot> => ({
        voter,
        ...vote,
        votedAt,
      })
    )
  },
}

export const proposalCreatedAt: ContractFormula<
  string | undefined,
  { id: string }
> = {
  compute: async ({
    contractAddress,
    getDateFirstTransformed,
    getDateKeyFirstSet,
    args: { id },
  }) =>
    (
      (await getDateFirstTransformed(contractAddress, `proposal:${id}`)) ??
      // Fallback to events.
      (await getDateKeyFirstSet(contractAddress, 'proposals_v2', Number(id))) ??
      (await getDateKeyFirstSet(contractAddress, 'proposals', Number(id)))
    )?.toISOString(),
}

// Return open proposals. If an address is passed, adds a flag indicating if
// they've voted or not.
export const openProposals: ContractFormula<
  (ProposalResponse<SingleChoiceProposal> & { voted?: boolean })[],
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
    const openProposalsWithVotes =
      env.args.address && openProposalVotes
        ? openProposals.map((proposal, index) => ({
            ...proposal,
            voted: !!openProposalVotes[index],
          }))
        : openProposals

    return openProposalsWithVotes
  },
}

// Return passed proposals.
export const passedProposals: ContractFormula<
  ProposalResponse<SingleChoiceProposal>[]
> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) =>
    (
      await listProposals.compute({
        ...env,
        args: {},
      })
    ).filter(
      ({ proposal }) =>
        proposal.status === Status.Passed ||
        proposal.status === Status.Executed ||
        proposal.status === Status.ExecutionFailed
    ),
}

// Helpers

// https://github.com/DA0-DA0/dao-contracts/blob/e1f46b48cc72d4e48bf6afcb44432979347e594c/contracts/proposal/dao-proposal-single/src/proposal.rs#L50
const intoResponse = async (
  env: ContractEnv,
  proposal: SingleChoiceProposal,
  id: number,
  { v2 }: { v2: boolean }
): Promise<ProposalResponse<SingleChoiceProposal>> => {
  // Update status.
  if (proposal.status === Status.Open) {
    if (isPassed(env, proposal)) {
      proposal.status = Status.Passed
    } else if (
      isExpirationExpired(env, proposal.expiration) ||
      isRejected(env, proposal)
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
      (await env.getDateFirstTransformed(
        env.contractAddress,
        `proposal:${id}`,
        {
          status: {
            [Op.in]: ['executed', 'execution_failed'],
          },
        }
      )) ??
      // Fallback to events.
      (await env.getDateKeyFirstSetWithValueMatch(
        env.contractAddress,
        [v2 ? 'proposals_v2' : 'proposals', id],
        {
          status: {
            [Op.in]: ['executed', 'execution_failed'],
          },
        }
      ))
    )?.toISOString()
  }

  let closedAt: string | undefined
  if (proposal.status === Status.Closed) {
    closedAt = (
      (await env.getDateFirstTransformed(
        env.contractAddress,
        `proposal:${id}`,
        {
          status: 'closed',
        }
      )) ??
      // Fallback to events.
      (await env.getDateKeyFirstSetWithValueMatch(
        env.contractAddress,
        [v2 ? 'proposals_v2' : 'proposals', id],
        {
          status: 'closed',
        }
      ))
    )?.toISOString()
  }

  let completedAt: string | undefined
  if (proposal.status !== Status.Open) {
    completedAt =
      executedAt ||
      closedAt ||
      // If not yet executed nor closed, completed when it was passed/rejected.
      (
        (await env.getDateFirstTransformed(
          env.contractAddress,
          `proposal:${id}`,
          {
            status: {
              [Op.in]: ['passed', 'rejected'],
            },
          }
        )) ??
        // Fallback to events.
        (await env.getDateKeyFirstSetWithValueMatch(
          env.contractAddress,
          [v2 ? 'proposals_v2' : 'proposals', id],
          {
            status: {
              [Op.in]: ['passed', 'rejected'],
            },
          }
        ))
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
