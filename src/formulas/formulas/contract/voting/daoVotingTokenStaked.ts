import { ContractFormula } from '@/types'

import { TotalPowerAtHeight, VotingPowerAtHeight } from '../../types'
import { makeSimpleContractFormula } from '../../utils'

interface StakerBalance {
  address: string
  balance: string
}

type Config = {
  denom: string
}

const CODE_IDS_KEYS = ['dao-voting-token-staked']

export { activeThreshold } from './common'

export const votingPowerAtHeight: ContractFormula<
  VotingPowerAtHeight,
  { address: string }
> = {
  docs: {
    description:
      'retrieves the voting power for an address at a specific block height',
    args: [
      {
        name: 'address',
        description: 'address to get voting power for',
        required: true,
      },
      {
        name: 'block',
        description: 'block height to get voting power at',
        required: true,
      },
    ],
  },
  // Filter by code ID since someone may modify the contract. This is also used
  // in DAO core to match the voting module and pass the query through.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { address },
    block,
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return {
      power:
        (
          await getTransformationMatch<string>(
            contractAddress,
            `stakedBalance:${address}`
          )
        )?.value ?? '0',
      height: Number(block.height),
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
      },
    ],
  },
  filter: votingPowerAtHeight.filter,
  compute: async (env) => (await votingPowerAtHeight.compute(env)).power,
}

export const totalPowerAtHeight: ContractFormula<TotalPowerAtHeight> = {
  docs: {
    description: 'retrieves the total voting power at a specific block height',
    args: [
      {
        name: 'block',
        description: 'block height to get total power at',
        required: true,
      },
    ],
  },
  // Filter by code ID since someone may modify the contract. This is also used
  // in DAO core to match the voting module and pass the query through.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({ contractAddress, getTransformationMatch, block }) => {
    return {
      power:
        (await getTransformationMatch<string>(contractAddress, 'totalStaked'))
          ?.value || '0',
      height: Number(block.height),
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

export const denom = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the token denomination used by the contract',
  },
  transformation: 'denom',
})

export const tokenIssuerContract = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the token issuer contract address',
  },
  transformation: 'tokenIssuerContract',
})

export const claims: ContractFormula<{ claims: any[] }, { address: string }> = {
  docs: {
    description: 'retrieves the claims for a given address',
    args: [
      {
        name: 'address',
        description: 'address to get claims for',
        required: true,
      },
    ],
  },
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return {
      claims: (await get<any[]>(contractAddress, 'claims', address)) ?? [],
    }
  },
}

export const config = makeSimpleContractFormula<Config>({
  docs: {
    description: 'retrieves the configuration of the contract',
  },
  transformation: 'config',
})

export const listStakers: ContractFormula<
  { stakers: StakerBalance[] },
  {
    limit?: string
    startAfter?: string
  }
> = {
  docs: {
    description: 'retrieves a list of stakers',
    args: [
      {
        name: 'limit',
        description: 'maximum number of stakers to return',
        required: false,
      },
      {
        name: 'startAfter',
        description: 'address to start after in the list',
        required: false,
      },
    ],
  },
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

    return {
      stakers: stakes.map(([address, balance]) => ({
        address,
        balance,
      })),
    }
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
    const { contractAddress, getMap } = env

    // Get stakers.
    const stakerBalances =
      (await getMap<string, string>(contractAddress, 'staked_balances')) ?? {}

    // Get total power.
    const totalVotingPower = Number(await totalPower.compute(env))

    // Compute voting power for each staker.
    const stakers = Object.entries(stakerBalances)
      .map(
        ([address, balance]): Staker => ({
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
    description: 'retrieves the hooks associated with the contract',
  },
  transformation: 'hooks',
  fallbackKeys: ['hooks'],
  fallback: { hooks: [] },
  transform: (hooks) => ({ hooks }),
})
