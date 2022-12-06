import { Formula } from '../types'

export const groupContract: Formula<string> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'group_contract')

export const votingPower: Formula<number, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => {
  const weight = await get<number | undefined>(
    contractAddress,
    'user_weights',
    address
  )
  return weight || 0
}

export const totalPower: Formula<number> = async ({ contractAddress, get }) => {
  const weight = await get<number | undefined>(contractAddress, 'total_weight')
  return weight || 0
}
