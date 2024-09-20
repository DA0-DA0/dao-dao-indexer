import { ContractFormula } from '@/types'

import { makeSimpleContractFormula } from '../../utils'

interface Member {
  addr: string
  weight: number
}

export const member: ContractFormula<number, { address: string }> = {
  docs: {
    description: 'retrieves the weight of a member in the group',
    args: [
      {
        name: 'address',
        description: 'address of the member to query',
        required: true,
      },
    ],
  },
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
  docs: {
    description: 'lists members of the group',
    args: [
      {
        name: 'limit',
        description: 'maximum number of members to return',
        required: false,
      },
      {
        name: 'startAfter',
        description: 'address to start listing after',
        required: false,
      },
    ],
  },
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

export const totalWeight = makeSimpleContractFormula<number>({
  docs: {
    description: 'retrieves the total weight of all members in the group',
  },
  key: 'total',
  fallback: 0,
})

export const admin = makeSimpleContractFormula<string | null>({
  docs: {
    description: 'retrieves the admin address of the contract',
  },
  key: 'admin',
  // Null if no admin exists.
  fallback: null,
})

export const hooks = makeSimpleContractFormula<string[], { hooks: string[] }>({
  docs: {
    description: 'retrieves the hooks associated with the contract',
  },
  transformation: 'hooks',
  fallbackKeys: ['cw4-hooks'],
  fallback: { hooks: [] },
  transform: (hooks) => ({ hooks }),
})
