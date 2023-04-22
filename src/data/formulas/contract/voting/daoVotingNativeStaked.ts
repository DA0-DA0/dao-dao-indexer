import { ContractFormula } from '@/core'

interface StakerBalance {
  address: string
  balance: string
}

type Config = {
  denom: string
}

export const votingPower: ContractFormula<string, { address: string }> = {
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
        await getTransformationMatch<string>(
          contractAddress,
          `stakedBalance:${address}`
        )
      )?.value ?? '0'
    )
  },
}

export const totalPower: ContractFormula<string> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'totalStaked'))
      ?.value || '0',
}

export const dao: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string | undefined>(contractAddress, 'dao'))
      ?.value,
}

export const claims: ContractFormula<any[] | undefined, { address: string }> = {
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return await get<any[]>(contractAddress, 'claims', address)
  },
}

export const config: ContractFormula<Config | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<Config>(contractAddress, 'config'))?.value,
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
