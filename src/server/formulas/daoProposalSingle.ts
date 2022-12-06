import { Formula } from '../types'

type CreationPolicy =
  | {
      Anyone: {}
    }
  | {
      Module: {
        addr: string
      }
    }

type Proposal = any
interface ProposalResponse {
  id: number
  proposal: Proposal
  createdAt?: string
}

export const config: Formula<any> = async ({ contractAddress, get }) =>
  (await get(contractAddress, 'config_v2')) ??
  (await get(contractAddress, 'config'))

export const creationPolicy: Formula<CreationPolicy | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'creation_policy')

export const proposalCount: Formula<number> = async ({
  contractAddress,
  get,
}) =>
  // V1 may have no proposal_count set, so default to 0.
  (await get(contractAddress, 'proposal_count')) ?? 0

export const proposalCreatedAt: Formula<
  string | undefined,
  { id: string }
> = async ({ contractAddress, getDateKeyFirstSet, args: { id } }) =>
  (
    (await getDateKeyFirstSet(contractAddress, 'proposals_v2', Number(id))) ??
    (await getDateKeyFirstSet(contractAddress, 'proposals', Number(id)))
  )?.toISOString()

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
    args: { limit = '10', startBefore },
  } = env

  const proposals =
    (await getMap<number, Proposal>(contractAddress, 'proposals_v2', {
      numericKeys: true,
    })) ??
    (await getMap<number, Proposal>(contractAddress, 'proposals', {
      numericKeys: true,
    })) ??
    {}

  const limitNum = Math.max(0, Math.min(Number(limit), 10))
  const startBeforeNum = startBefore
    ? Math.max(0, Number(startBefore))
    : Infinity

  const reverseProposalIds = Object.keys(proposals)
    .map(Number)
    .sort((a, b) => b - a)
    .filter((id) => id < startBeforeNum)
    .slice(0, limitNum)

  const proposalsCreatedAt = await Promise.all(
    reverseProposalIds.map((id) =>
      proposalCreatedAt({
        ...env,
        args: {
          id: id.toString(),
        },
      })
    )
  )

  return reverseProposalIds.map((id, index) => ({
    id,
    proposal: proposals[id],
    createdAt: proposalsCreatedAt[index],
  }))
}

export const proposal: Formula<ProposalResponse, { id: string }> = async (
  env
) => {
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
