import { Formula } from '../types'

export const stakedBalance: Formula<number, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => {
  const staked = await get<number | undefined>(
    contractAddress,
    'staked_balances',
    address
  )
  return staked || 0
}

export const totalStaked: Formula<number> = async ({
  contractAddress,
  get,
}) => {
  const total = await get<number | undefined>(contractAddress, 'total_staked')
  return total || 0
}
