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
}

export const creationPolicy: Formula<CreationPolicy> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'creation_policy')

export const proposalCount: Formula<number> = async ({
  contractAddress,
  get,
}) =>
  // V1 may have no proposal_count set, so default to 0.
  (await get(contractAddress, 'proposal_count')) ?? 0

export const proposalCreatedAt: Formula<string, { id: string }> = async ({
  contractAddress,
  getDateKeyFirstSet,
  args: { id },
}) =>
  (
    (await getDateKeyFirstSet(contractAddress, 'proposals_v2', Number(id))) ??
    (await getDateKeyFirstSet(contractAddress, 'proposals', Number(id)))
  )?.toISOString()

export const reverseProposals: Formula<ProposalResponse[]> = async ({
  contractAddress,
  getMap,
}) => {
  const proposals =
    (await getMap<number, Proposal>(contractAddress, 'proposals_v2', {
      numericKeys: true,
    })) ??
    (await getMap<number, Proposal>(contractAddress, 'proposals', {
      numericKeys: true,
    })) ??
    {}

  return Object.entries(proposals).map(([id, proposal]) => ({
    id: Number(id),
    proposal,
  }))
}
