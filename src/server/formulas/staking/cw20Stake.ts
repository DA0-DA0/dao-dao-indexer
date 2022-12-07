import { Formula } from '../../types'

interface StakerBalance {
  address: string
  balance: string
}

export const config: Formula<any | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'config')

export const stakedBalance: Formula<string, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) =>
  (await get<string | undefined>(
    contractAddress,
    'staked_balances',
    address
  )) || '0'

export const totalStaked: Formula<string> = async ({ contractAddress, get }) =>
  (await get<string | undefined>(contractAddress, 'total_staked')) || '0'

export const stakedValue: Formula<string, { address: string }> = async (
  env
) => {
  const balance = Number(await totalValue(env))
  const staked = Number(await stakedBalance(env))
  const total = Number(await totalStaked(env))

  if (balance === 0 || staked === 0 || total === 0) {
    return '0'
  }

  return total === 0 ? '0' : Math.floor((staked * balance) / total).toString()
}

export const totalValue: Formula<string> = async ({ contractAddress, get }) =>
  (await get<string | undefined>(contractAddress, 'balance')) || '0'

export const claims: Formula<any[] | undefined, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => await get<any[]>(contractAddress, 'claims', address)

export const listStakers: Formula<
  StakerBalance[],
  {
    limit?: string
    startAfter?: string
  }
> = async ({ contractAddress, getMap, args: { limit, startAfter } }) => {
  const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

  const stakers =
    (await getMap<string, string>(contractAddress, 'staked_balances')) ?? {}
  const stakes = Object.entries(stakers)
    // Ascending by address.
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([address]) => !startAfter || address.localeCompare(startAfter) > 0)
    .slice(0, limitNum)

  return stakes.map(([address, balance]) => ({
    address,
    balance,
  }))
}

export const topStakers: Formula<
  StakerBalance[],
  {
    limit?: string
  }
> = async ({ contractAddress, getMap, args: { limit } }) => {
  const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

  const stakers =
    (await getMap<string, string>(contractAddress, 'staked_balances')) ?? {}
  const stakes = Object.entries(stakers)
    // Descending by balance.
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, limitNum)

  return stakes.map(([address, balance]) => ({
    address,
    balance,
  }))
}