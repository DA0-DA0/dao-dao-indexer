import { ContractFormula } from '@/types'

import { TotalPowerAtHeight, VotingPowerAtHeight } from '../../types'
import {
  makeSimpleContractFormula,
  mapRange,
  snapshotItemMayLoadAtHeight,
  snapshotMapMayLoadAtHeight,
} from '../../utils'

interface StakerBalance {
  address: string
  balance: string
}

type Config = {
  denom: string
}

const CODE_IDS_KEYS = ['dao-voting-native-staked']

export { activeThreshold } from './common'

export const votingPowerAtHeight: ContractFormula<
  VotingPowerAtHeight,
  {
    address: string
    height?: string
  }
> = {
  docs: {
    description:
      'retrieves the voting power for an address, optionally at a specific block height',
    args: [
      {
        name: 'address',
        description: 'address to get voting power for',
        required: true,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'height',
        description: 'block height to get voting power at',
        required: false,
        schema: {
          type: 'integer',
        },
      },
    ],
  },
  // Filter by code ID since someone may modify the contract. This is also used
  // in DAO core to match the voting module and pass the query through.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) => {
    if (!env.args.address) {
      throw new Error('missing `address`')
    }

    const height = env.args.height
      ? Number(env.args.height)
      : Number(env.block.height)
    const power =
      (await snapshotMapMayLoadAtHeight<string, string>({
        env,
        name: 'stakedBalances',
        key: env.args.address,
        height,
      })) ?? '0'

    return {
      power,
      height,
    }
  },
}

export const votingPower: ContractFormula<string, { address: string }> = {
  docs: {
    description:
      'retrieves the voting power for an address at the current block height',
    args: [
      {
        name: 'address',
        description: 'address to get voting power for',
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  filter: votingPowerAtHeight.filter,
  compute: async (env) => (await votingPowerAtHeight.compute(env)).power,
}

export const totalPowerAtHeight: ContractFormula<
  TotalPowerAtHeight,
  {
    height?: string
  }
> = {
  docs: {
    description:
      'retrieves the total voting power, optionally at a specific block height',
    args: [
      {
        name: 'height',
        description: 'block height to get total power at',
        required: false,
        schema: {
          type: 'integer',
        },
      },
    ],
  },
  // Filter by code ID since someone may modify the contract. This is also used
  // in DAO core to match the voting module and pass the query through.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) => {
    const height = env.args.height
      ? Number(env.args.height)
      : Number(env.block.height)
    const power =
      (await snapshotItemMayLoadAtHeight<string>({
        env,
        name: 'stakedTotal',
        height,
      })) ?? '0'

    return {
      power,
      height,
    }
  },
}

export const totalPower: ContractFormula<string> = {
  docs: {
    description: 'retrieves the total voting power at the current block height',
  },
  filter: totalPowerAtHeight.filter,
  compute: async (env) => (await totalPowerAtHeight.compute(env)).power,
}

export const dao = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the DAO address associated with the contract',
  },
  transformation: 'dao',
})

export const claims: ContractFormula<any[], { address: string }> = {
  docs: {
    description: 'retrieves the claims for a given address',
    args: [
      {
        name: 'address',
        description: 'address to get claims for',
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return (
      (
        await getTransformationMatch<any[]>(
          contractAddress,
          `claims:${address}`
        )
      )?.value ?? []
    )
  },
}

export const config = makeSimpleContractFormula<Config>({
  docs: {
    description: 'retrieves the configuration for the contract',
  },
  transformation: 'config',
})

export const listStakers: ContractFormula<
  StakerBalance[],
  {
    limit?: string
    startAfter?: string
  }
> = {
  docs: {
    description: 'retrieves a list of stakers with their balances',
    args: [
      {
        name: 'limit',
        description: 'maximum number of stakers to return',
        required: false,
        schema: {
          type: 'integer',
        },
      },
      {
        name: 'startAfter',
        description: 'address to start listing after in ascending order',
        required: false,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  compute: async (env) => {
    const { limit, startAfter } = env.args

    const stakers = await mapRange<string>({
      env,
      name: 'stakedBalances',
      startAfter,
      limit: limit ? Math.max(0, Number(limit)) : undefined,
    })

    return stakers.map(({ key, value }) => ({
      address: key,
      balance: value,
    }))
  },
}

type Staker = StakerBalance & {
  votingPowerPercent: number
}

export const topStakers: ContractFormula<Staker[]> = {
  docs: {
    description: 'retrieves the top stakers sorted by voting power',
  },
  compute: async (env) => {
    // Get stakers.
    const allStakers = await listStakers.compute(env)

    // Get total power.
    const totalVotingPower = Number(
      await totalPower.compute({
        ...env,
        // Make sure to not pass height in case it was passed to this formula.
        args: {},
      })
    )

    // Compute voting power for each staker.
    const stakers = allStakers
      .map(
        ({ address, balance }): Staker => ({
          address,
          balance,
          votingPowerPercent:
            totalVotingPower === 0
              ? 0
              : (Number(balance) / totalVotingPower) * 100,
        })
      )
      // Descending by voting power.
      .sort((a, b) => b.votingPowerPercent - a.votingPowerPercent)

    return stakers
  },
}

export const getHooks = makeSimpleContractFormula<
  string[],
  { hooks: string[] }
>({
  docs: {
    description: 'retrieves the hooks for the contract',
  },
  transformation: 'hooks',
  fallbackKeys: ['hooks'],
  fallback: { hooks: [] },
  transform: (hooks) => ({ hooks }),
})
