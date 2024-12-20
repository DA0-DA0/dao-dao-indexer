import { ContractFormula } from '@/types'

import {
  makeSimpleContractFormula,
  mapRange,
  snapshotItemMayLoad,
  snapshotItemMayLoadAtHeight,
  snapshotMapMayLoad,
  snapshotMapMayLoadAtHeight,
} from '../../utils'

const CODE_IDS_KEYS = ['cw4-group']

interface Member {
  addr: string
  weight: number
}

export const member: ContractFormula<
  number,
  {
    address: string
    height?: string
  }
> = {
  docs: {
    description:
      'retrieves the weight of a member in the group, optionally at a specific height',
    args: [
      {
        name: 'address',
        description: 'address of the member to query',
        required: true,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'height',
        description: 'height to query at',
        required: false,
        schema: {
          type: 'integer',
        },
      },
    ],
  },
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) => {
    if (!env.args.address) {
      throw new Error('missing `address`')
    }

    return (
      (env.args.height
        ? await snapshotMapMayLoadAtHeight<string, number>({
            env,
            name: 'members',
            key: env.args.address,
            height: Number(env.args.height),
          })
        : await snapshotMapMayLoad<string, number>({
            env,
            name: 'members',
            key: env.args.address,
          })) ?? 0
    )
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
        schema: {
          type: 'integer',
        },
      },
      {
        name: 'startAfter',
        description: 'address to start listing after',
        required: false,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  compute: async (env) => {
    const members = await mapRange<number>({
      env,
      name: 'members',
      startAfter: env.args.startAfter,
      limit: env.args.limit ? Math.max(0, Number(env.args.limit)) : undefined,
    })

    return members.map(({ key: addr, value: weight }) => ({
      addr,
      weight,
    }))
  },
}

export const totalWeight: ContractFormula<
  number,
  {
    height?: string
  }
> = {
  docs: {
    description:
      'retrieves the total weight of all members in the group, optionally at a specific height',
    args: [
      {
        name: 'height',
        description: 'height to query at',
        required: false,
        schema: {
          type: 'integer',
        },
      },
    ],
  },
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) =>
    (env.args.height
      ? await snapshotItemMayLoadAtHeight<number>({
          env,
          name: 'total',
          height: Number(env.args.height),
        })
      : await snapshotItemMayLoad<number>({
          env,
          name: 'total',
        })) ?? 0,
}

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
