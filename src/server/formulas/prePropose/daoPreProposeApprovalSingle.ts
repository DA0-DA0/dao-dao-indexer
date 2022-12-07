import { Formula } from '../../types'

export * from './daoPreProposeBase'

export const approver: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'approver')

export const pendingProposal: Formula<
  any | undefined,
  { id: string }
> = async ({ contractAddress, get, args: { id } }) =>
  await get(contractAddress, 'pending_proposals', id)

export const pendingProposals: Formula<any[] | undefined> = async ({
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
export const reversePendingProposals: Formula<any[] | undefined> = async ({
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
      // Ascending by ID.
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, proposal]) => proposal)
  )
}
