import { ContractFormula } from '@/core'

export * from './daoPreProposeBase'

export const approver: ContractFormula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'approver')

export const pendingProposal: ContractFormula<
  any | undefined,
  { id: string }
> = async ({ contractAddress, get, args: { id } }) => {
  if (!id) {
    throw new Error('missing `id`')
  }

  return await get(contractAddress, 'pending_proposals', id)
}

export const pendingProposals: ContractFormula<any[] | undefined> = async ({
  contractAddress,
  getMap,
}) => {
  const pendingProposals = await getMap<number>(
    contractAddress,
    'pending_proposals',
    {
      numericKeys: true,
    }
  )
  if (!pendingProposals) {
    return undefined
  }

  return (
    Object.entries(pendingProposals)
      // Descending by ID.
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([, proposal]) => proposal)
  )
}

export const reversePendingProposals: ContractFormula<
  any[] | undefined
> = async ({ contractAddress, getMap }) => {
  const pendingProposals = await getMap<number>(
    contractAddress,
    'pending_proposals',
    {
      numericKeys: true,
    }
  )
  if (!pendingProposals) {
    return undefined
  }

  return (
    Object.entries(pendingProposals)
      // Ascending by ID.
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, proposal]) => proposal)
  )
}
