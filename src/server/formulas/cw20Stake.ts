import { Formula } from '../types'

export const stakedBalance: Formula<string, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => {
  const staked = await get<string | undefined>(
    contractAddress,
    'staked_balances',
    address
  )
  return staked || '0'
}

export const totalStaked: Formula<string> = async ({
  contractAddress,
  get,
}) => {
  const total = await get<string | undefined>(contractAddress, 'total_staked')
  return total || '0'
}
