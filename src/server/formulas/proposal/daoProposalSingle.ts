import { Formula } from '../../types'

type Proposal = any
interface ProposalResponse {
  id: number
  proposal: Proposal
  createdAt?: string
}

interface Ballot {
  power: string
  vote: string
  rationale: string | null
}

interface VoteInfo extends Ballot {
  voter: string
  votedAt?: Date
}

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
  const proposalResponse =
    (await get<Proposal>(contractAddress, 'proposals_v2', idNum)) ??
    (await get<Proposal>(contractAddress, 'proposals', idNum)) ??
    undefined

  return (
    proposalResponse && {
      id: idNum,
      proposal: proposalResponse,
      createdAt: await proposalCreatedAt(env),
    }
  )
}

export const creationPolicy: Formula = async ({ contractAddress, get }) =>
  await get(contractAddress, 'creation_policy')

const listProposalsMaker =
  (
    sortFn: (a: number, b: number) => number
  ): Formula<
    ProposalResponse[],
    {
      limit?: string
      startBefore?: string
    }
  > =>
  async (env) => {
    const {
      contractAddress,
      getMap,
      args: { limit = '30', startBefore },
    } = env

    const proposals =
      (await getMap<number, Proposal>(contractAddress, 'proposals_v2', {
        numericKeys: true,
      })) ??
      (await getMap<number, Proposal>(contractAddress, 'proposals', {
        numericKeys: true,
      })) ??
      {}

    const limitNum = Math.max(0, Math.min(Number(limit), 30))
    const startBeforeNum = startBefore
      ? Math.max(0, Number(startBefore))
      : Infinity

    const proposalIds = Object.keys(proposals)
      .map(Number)
      // Sort according to sortFn argument.
      .sort(sortFn)
      .filter((id) => id < startBeforeNum)
      .slice(0, limitNum)

    const proposalsCreatedAt = await Promise.all(
      proposalIds.map((id) =>
        proposalCreatedAt({
          ...env,
          args: {
            id: id.toString(),
          },
        })
      )
    )

    return proposalIds.map((id, index) => ({
      id,
      proposal: proposals[id],
      createdAt: proposalsCreatedAt[index],
    }))
  }

// Ascending by proposal ID.
export const listProposals = listProposalsMaker((a, b) => a - b)
// Descending by proposal ID.
export const reverseProposals = listProposalsMaker((a, b) => b - a)

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
    'ballot',
    Number(proposalId),
    voter
  )
  if (!ballot) {
    return undefined
  }

  const votedAt = await getDateKeyModified(
    contractAddress,
    'ballots',
    Number(proposalId),
    voter
  )

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
    startBefore?: string
  }
> = async (env) => {
  const {
    contractAddress,
    getMap,
    getDateKeyModified,
    args: { proposalId, limit = '30', startBefore },
  } = env

  const ballots =
    (await getMap<string, Ballot>(contractAddress, [
      'ballots',
      Number(proposalId),
    ])) ?? {}

  const limitNum = Math.max(0, Math.min(Number(limit), 30))

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
    votedAt: votesCastAt[index],
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
