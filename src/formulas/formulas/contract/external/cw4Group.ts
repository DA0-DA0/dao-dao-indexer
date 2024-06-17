import { ContractFormula } from '@/types'

interface Member {
  addr: string
  weight: number
}

export const member: ContractFormula<number, { address: string }> = {
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return (await get<number>(contractAddress, 'members', address)) ?? 0
  },
}

export const listMembers: ContractFormula<
  Member[],
  {
    limit?: string
    startAfter?: string
  }
> = {
  compute: async ({ contractAddress, getMap, args: { limit, startAfter } }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const membersMap =
      (await getMap<string, number>(contractAddress, 'members')) ?? {}
    const members = Object.entries(membersMap)
      // Ascending by address.
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(
        ([address]) => !startAfter || address.localeCompare(startAfter) > 0
      )
      .slice(0, limitNum)

    return members.map(([addr, weight]) => ({
      addr,
      weight,
    }))
  },
}

export const totalWeight: ContractFormula<number> = {
  compute: async ({ contractAddress, get }) =>
    (await get<number>(contractAddress, 'total')) ?? 0,
}

export const admin: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get<string>(contractAddress, 'admin'),
}
