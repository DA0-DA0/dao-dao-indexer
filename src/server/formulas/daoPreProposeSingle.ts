import { Formula } from '../types'

export const config: Formula<any | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'config')

export const depositInfo: Formula<
  any | undefined,
  { proposalId: string }
> = async ({ contractAddress, get, args: { proposalId } }) => {
  const data = await get(contractAddress, 'deposits', Number(proposalId))
  return data
}
