import { Op } from 'sequelize'

import { ContractEnv, ContractFormula } from '@/core'

import { VoteCast, VoteInfo } from '../../../../types'
import { expirationPlusDuration, isExpirationExpired } from '../../../utils'
import { ListProposalFilter, ProposalResponse, StatusEnum } from '../types'
import { isPassed, isRejected } from './status'
import { Ballot, Config, MultipleChoiceProposal } from './types'

export const config: ContractFormula<Config | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'config'),
}

export const dao: ContractFormula<string | undefined> = {
  compute: async (env) => (await config.compute(env))?.dao,
}

export const proposal: ContractFormula<
  ProposalResponse<MultipleChoiceProposal> | undefined,
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
    const proposal =
      (
        await getTransformationMatch<MultipleChoiceProposal>(
          contractAddress,
          `proposal:${id}`
        )
      )?.value ??
      // Fallback to events.
      (await get<MultipleChoiceProposal>(contractAddress, 'proposals', idNum))

    return proposal && intoResponse(env, proposal, idNum)
  },
}

export const creationPolicy: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'creation_policy'),
}

export const listProposals: ContractFormula<
  ProposalResponse<MultipleChoiceProposal>[],
  {
    limit?: string
    startAfter?: string
    // Filter by status.
    filter?: ListProposalFilter
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

    const proposals =
      (await getTransformationMap<number, MultipleChoiceProposal>(
        contractAddress,
        'proposal'
      )) ??
      // Fallback to events.
      (await getMap<number, MultipleChoiceProposal>(
        contractAddress,
        'proposals',
        { keyType: 'number' }
      )) ??
      {}

    const proposalIds = Object.keys(proposals)
      .map(Number)
      // Ascending by proposal ID.
      .sort((a, b) => a - b)
      .filter((id) => id > startAfterNum)
      .slice(0, limitNum)

    const proposalResponses = (
      await Promise.all(
        proposalIds.map((id) => intoResponse(env, proposals[id], id))
      )
    ).filter(({ proposal }) =>
      env.args.filter === 'passed'
        ? proposal.status === StatusEnum.Passed ||
          proposal.status === StatusEnum.Executed ||
          proposal.status === StatusEnum.ExecutionFailed
        : true
    )

    return proposalResponses
  },
}

export const reverseProposals: ContractFormula<
  ProposalResponse<MultipleChoiceProposal>[],
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

    const proposals =
      (await getTransformationMap<number, MultipleChoiceProposal>(
        contractAddress,
        'proposal'
      )) ??
      // Fallback to events.
      (await getMap<number, MultipleChoiceProposal>(
        contractAddress,
        'proposals',
        { keyType: 'number' }
      )) ??
      {}

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
      (await getDateKeyFirstSet(contractAddress, 'proposals', Number(id)))
    )?.toISOString(),
}

// Return open proposals. If an address is passed, adds a flag indicating if
// they've voted or not.
export const openProposals: ContractFormula<
  (ProposalResponse<MultipleChoiceProposal> & { voted?: boolean })[],
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
    ).filter(({ proposal }) => proposal.status === StatusEnum.Open)

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

// Helpers

// https://github.com/DA0-DA0/dao-contracts/blob/fa567797e2f42e70296a2d6f889f341ff80f0695/contracts/proposal/dao-proposal-single/src/proposal.rs#L50
const intoResponse = async (
  env: ContractEnv,
  proposal: MultipleChoiceProposal,
  id: number
): Promise<ProposalResponse<MultipleChoiceProposal>> => {
  // Update status.
  if (proposal.status === StatusEnum.Open) {
    if (isPassed(env, proposal)) {
      if (proposal.veto) {
        const expiration = expirationPlusDuration(
          proposal.expiration,
          proposal.veto.delay
        )

        if (isExpirationExpired(env, expiration)) {
          proposal.status = StatusEnum.Passed
        } else {
          proposal.status = {
            veto_timelock: {
              expiration,
            },
          }
        }
      } else {
        proposal.status = StatusEnum.Passed
      }
    } else if (
      isExpirationExpired(env, proposal.expiration) ||
      isRejected(env, proposal)
    ) {
      proposal.status = StatusEnum.Rejected
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
    proposal.status === StatusEnum.Executed ||
    proposal.status === StatusEnum.ExecutionFailed
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
        ['proposals', id],
        {
          status: {
            [Op.in]: ['executed', 'execution_failed'],
          },
        }
      ))
    )?.toISOString()
  }

  let closedAt: string | undefined
  if (proposal.status === StatusEnum.Closed) {
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
        ['proposals', id],
        {
          status: 'closed',
        }
      ))
    )?.toISOString()
  }

  let completedAt: string | undefined
  if (proposal.status !== StatusEnum.Open) {
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
          ['proposals', id],
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
