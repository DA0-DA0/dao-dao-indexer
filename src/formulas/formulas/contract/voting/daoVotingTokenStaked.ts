import { ContractFormula } from '@/types'

import { TotalPowerAtHeight, VotingPowerAtHeight } from '../../types'

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
  filter: votingPowerAtHeight.filter,
  compute: async (env) => (await votingPowerAtHeight.compute(env)).power,
}

export const totalPowerAtHeight: ContractFormula<TotalPowerAtHeight> = {
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
  filter: totalPowerAtHeight.filter,
  compute: async (env) => (await totalPowerAtHeight.compute(env)).power,
}

export const dao: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string | undefined>(contractAddress, 'dao'))
      ?.value,
}

export const denom: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string | undefined>(contractAddress, 'denom'))
      ?.value,
}

export const tokenIssuerContract: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (
      await getTransformationMatch<string | undefined>(
        contractAddress,
        'tokenIssuerContract'
      )
    )?.value,
}

export const claims: ContractFormula<
  { claims: any[] } | undefined,
  { address: string }
> = {
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    const claims = await get<any[]>(contractAddress, 'claims', address)
    return claims && { claims }
  },
}

export const config: ContractFormula<Config | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<Config>(contractAddress, 'config'))?.value,
}

export const listStakers: ContractFormula<
  { stakers: StakerBalance[] },
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

export const topStakers: ContractFormula<Staker[] | undefined> = {
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
