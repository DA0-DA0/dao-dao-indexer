import { Formula } from '../types'

export const groupContract: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'group_contract')

export const votingPower: Formula<string, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => {
  const weight = await get<string | undefined>(
    contractAddress,
    'user_weights',
    address
  )
  return weight || '0'
}

export const totalPower: Formula<string> = async ({ contractAddress, get }) => {
  const weight = await get<string | undefined>(contractAddress, 'total_weight')
  return weight || '0'
}
