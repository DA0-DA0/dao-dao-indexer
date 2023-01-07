import { ContractFormula } from '@/core'

interface StakerBalance {
  address: string
  balance: string
}

export const votingPower: ContractFormula<string, { address: string }> = {
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return (
      (await get<string>(contractAddress, 'staked_balances', address)) || '0'
    )
  },
}

export const totalPower: ContractFormula<string> = {
  compute: async ({ contractAddress, get }) =>
    (await get<string>(contractAddress, 'total_staked')) || '0',
}

export const dao: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'dao'),
}

export const claims: ContractFormula<any[] | undefined, { address: string }> = {
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return await get<any[]>(contractAddress, 'claims', address)
  },
}

export const config: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'config'),
}

export const listStakers: ContractFormula<
  StakerBalance[],
  {
    limit?: string
    startAfter?: string
  }
> = {
  compute: async ({ contractAddress, getMap, args: { limit, startAfter } }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const stakers =
      (await getMap<string, string>(contractAddress, 'staked_balances')) ?? {}
    const stakes = Object.entries(stakers)
      // Ascending by address.
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(
        ([address]) => !startAfter || address.localeCompare(startAfter) > 0
      )
      .slice(0, limitNum)

    return stakes.map(([address, balance]) => ({
      address,
      balance,
    }))
  },
}
