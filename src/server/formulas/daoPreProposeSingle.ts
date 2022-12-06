import { Formula } from '../types'

export const config: Formula<any | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'config')

export const depositInfo: Formula<
  any | undefined,
  { proposalId: string }
> = async ({ contractAddress, get, args: { proposalId } }) => {
  const data = await get<[any, string]>(
    contractAddress,
    'deposits',
    Number(proposalId)
  )

  if (!data || !Array.isArray(data) || data.length !== 2) {
    return
  }

  return {
    deposit_info: data[0],
    proposer: data[1],
  }
}
