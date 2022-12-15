import { Env, Formula } from '../../types'
import { isExpirationExpired } from '../utils'
import { Ballot, Proposal, ProposalResponse, Status, VoteInfo } from './types'
import { isPassed, isRejected } from './utils/status'

export const config: Formula = async ({ contractAddress, get }) =>
  (await get(contractAddress, 'config_v2')) ??
  (await get(contractAddress, 'config'))

export const dao: Formula<string | undefined> = async (env) =>
  (await config(env))?.dao

export const proposal: Formula<
  ProposalResponse | undefined,
  { id: string }
> = async (env) => {
  const {
    contractAddress,
    get,
    args: { id },
  } = env

  const idNum = Number(id)
  const _proposal =
    (await get<Proposal>(contractAddress, 'proposals_v2', idNum)) ??
    (await get<Proposal>(contractAddress, 'proposals', idNum)) ??
    undefined

  return _proposal && intoResponse(env, _proposal, idNum)
}

export const creationPolicy: Formula = async ({ contractAddress, get }) =>
  await get(contractAddress, 'creation_policy')

export const listProposals: Formula<
  ProposalResponse[],
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
    (await getMap<number, Proposal>(contractAddress, 'proposals_v2', {
      numericKeys: true,
    })) ??
    (await getMap<number, Proposal>(contractAddress, 'proposals', {
      numericKeys: true,
    })) ??
    {}

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
  ProposalResponse[],
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
    (await getMap<number, Proposal>(contractAddress, 'proposals_v2', {
      numericKeys: true,
    })) ??
    (await getMap<number, Proposal>(contractAddress, 'proposals', {
      numericKeys: true,
    })) ??
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
  VoteInfo | undefined,
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
  VoteInfo[],
  {
    proposalId: string
    limit?: string
    startAfter?: string
  }
> = async ({
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
    (await getDateKeyFirstSet(contractAddress, 'proposals_v2', Number(id))) ??
    (await getDateKeyFirstSet(contractAddress, 'proposals', Number(id)))
  )?.toISOString()

// Helpers

const intoResponse = async (
  env: Env,
  proposal: Proposal,
  id: number
): Promise<ProposalResponse> => {
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

  return {
    id,
    proposal,
    createdAt,
  }
}
