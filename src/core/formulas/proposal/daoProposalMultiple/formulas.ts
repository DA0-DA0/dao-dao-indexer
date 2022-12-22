import { Env, Formula } from '../../../types'
import { isExpirationExpired } from '../../utils'
import { ProposalResponse, Status, VoteInfo } from '../types'
import { isPassed, isRejected } from './status'
import { Ballot, MultipleChoiceProposal } from './types'

export const config: Formula = async ({ contractAddress, get }) =>
  await get(contractAddress, 'config')

export const dao: Formula<string | undefined> = async (env) =>
  (await config(env))?.dao

export const proposal: Formula<
  ProposalResponse<MultipleChoiceProposal> | undefined,
  { id: string }
> = async (env) => {
  const {
    contractAddress,
    get,
    args: { id },
  } = env

  const idNum = Number(id)
  const _proposal =
    (await get<MultipleChoiceProposal>(contractAddress, 'proposals', idNum)) ??
    undefined

  return _proposal && intoResponse(env, _proposal, idNum)
}

export const creationPolicy: Formula = async ({ contractAddress, get }) =>
  await get(contractAddress, 'creation_policy')

export const listProposals: Formula<
  ProposalResponse<MultipleChoiceProposal>[],
  {
    limit?: string
    startAfter?: string
  }
> = async (env) => {
  const {
    contractAddress,
    getMap,
    args: { limit, startAfter },
  } = env

  const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
  const startAfterNum = startAfter ? Math.max(0, Number(startAfter)) : -Infinity

  const proposals =
    (await getMap<number, MultipleChoiceProposal>(
      contractAddress,
      'proposals',
      {
        numericKeys: true,
      }
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
}

export const reverseProposals: Formula<
  ProposalResponse<MultipleChoiceProposal>[],
  {
    limit?: string
    startBefore?: string
  }
> = async (env) => {
  const {
    contractAddress,
    getMap,
    args: { limit, startBefore },
  } = env

  const limitNum = limit ? Math.max(0, Number(limit)) : Infinity
  const startBeforeNum = startBefore
    ? Math.max(0, Number(startBefore))
    : Infinity

  const proposals =
    (await getMap<number, MultipleChoiceProposal>(
      contractAddress,
      'proposals',
      {
        numericKeys: true,
      }
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
}

export const proposalCount: Formula<number> = async ({
  contractAddress,
  get,
}) =>
  // V1 may have no proposal_count set, so default to 0.
  (await get(contractAddress, 'proposal_count')) ?? 0

export const nextProposalId: Formula<number> = async (env) =>
  (await proposalCount(env)) + 1

export const vote: Formula<
  VoteInfo<Ballot> | undefined,
  { proposalId: string; voter: string }
> = async ({
  contractAddress,
  get,
  getDateKeyModified,
  args: { proposalId, voter },
}) => {
  const ballot = await get<Ballot>(
    contractAddress,
    'ballots',
    Number(proposalId),
    voter
  )
  if (!ballot) {
    return undefined
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
}

export const listVotes: Formula<
  VoteInfo<Ballot>[],
  {
    proposalId: string
    limit?: string
    startBefore?: string
  }
> = async ({
  contractAddress,
  getMap,
  getDateKeyModified,
  args: { proposalId, limit, startBefore },
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
    .filter((voter) => !startBefore || voter.localeCompare(startBefore) < 0)
    .slice(0, limitNum)

  const votesCastAt = await Promise.all(
    voters.map((voter) =>
      getDateKeyModified(contractAddress, 'ballots', Number(proposalId), voter)
    )
  )

  return voters.map((voter, index) => ({
    voter,
    ...ballots[voter],
    votedAt: votesCastAt[index]?.toISOString(),
  }))
}

export const proposalCreatedAt: Formula<
  string | undefined,
  { id: string }
> = async ({ contractAddress, getDateKeyFirstSet, args: { id } }) =>
  (
    await getDateKeyFirstSet(contractAddress, 'proposals', Number(id))
  )?.toISOString()

// Return open proposals. If an address is passed, returns only proposals with
// no votes from the address.
export const openProposals: Formula<
  ProposalResponse<MultipleChoiceProposal>[],
  { address?: string }
> = async (env) => {
  const openProposals = (
    await listProposals({
      ...env,
      args: {},
    })
  ).filter(({ proposal }) => proposal.status === Status.Open)

  // Get votes for the given address for each open proposal. If no address,
  // don't filter by vote.
  const openProposalVotes = env.args.address
    ? await Promise.all(
        openProposals.map(({ id }) =>
          vote({
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
}

// Helpers

// https://github.com/DA0-DA0/dao-contracts/blob/fa567797e2f42e70296a2d6f889f341ff80f0695/contracts/proposal/dao-proposal-single/src/proposal.rs#L50
const intoResponse = async (
  env: Env,
  proposal: MultipleChoiceProposal,
  id: number
): Promise<ProposalResponse<MultipleChoiceProposal>> => {
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

  const createdAt = await proposalCreatedAt({
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
      await env.getDateKeyFirstSetWithValueMatch(
        env.contractAddress,
        ['proposals', id],
        {
          status: ['executed', 'execution_failed'],
        }
      )
    )?.toISOString()
  }

  let closedAt: string | undefined
  if (proposal.status === Status.Closed) {
    closedAt = (
      await env.getDateKeyFirstSetWithValueMatch(
        env.contractAddress,
        ['proposals', id],
        {
          status: 'closed',
        }
      )
    )?.toISOString()
  }

  let completedAt: string | undefined
  if (proposal.status !== Status.Open) {
    completedAt =
      executedAt ||
      closedAt ||
      // If not yet executed nor closed, completed when it was passed/rejected.
      (
        await env.getDateKeyFirstSetWithValueMatch(
          env.contractAddress,
          ['proposals', id],
          {
            status: ['passed', 'rejected'],
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
