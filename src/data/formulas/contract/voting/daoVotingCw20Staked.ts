import { ContractFormula } from '@/core'

import {
  StakerBalance,
  topStakers as cw20StakeTopStakers,
  stakedBalance,
  totalStaked,
} from '../staking/cw20Stake'

export const tokenContract: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'token'))?.value ??
    // Fallback to events.
    (await get<string>(contractAddress, 'token')),
}

export const stakingContract: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'stakingContract'))
      ?.value ??
    // Fallback to events.
    (await get<string>(contractAddress, 'staking_contract')),
}

export const votingPower: ContractFormula<
  string | undefined,
  { address: string }
> = {
  // Filter by code ID since someone may modify the contract.
  filter: {
    codeIdsKeys: ['dao-voting-cw20-staked'],
  },

  compute: async (env) => {
    if (!env.args.address) {
      throw new Error('missing `address`')
    }

    const stakingContractAddress = await stakingContract.compute(env)
    if (!stakingContractAddress) {
      return
    }

    // Unrecognized contract.
    if (
      !(await env.contractMatchesCodeIdKeys(
        stakingContractAddress,
        ...(stakedBalance.filter?.codeIdsKeys ?? [])
      ))
    ) {
      return
    }

    const power = await stakedBalance.compute({
      ...env,
      contractAddress: stakingContractAddress,
    })

    return power || '0'
  },
}

export const totalPower: ContractFormula<string> = {
  // Filter by code ID since someone may modify the contract.
  filter: {
    codeIdsKeys: ['dao-voting-cw20-staked'],
  },

  compute: async (env) => {
    const stakingContractAddress = (await stakingContract.compute(env)) ?? ''
    const power = await totalStaked.compute({
      ...env,
      contractAddress: stakingContractAddress,
    })

    return power || '0'
  },
}

export const dao: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'dao'))?.value ??
    // Fallback to events.
    (await get<string>(contractAddress, 'dao')),
}

// TODO: isActive

export const activeThreshold: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'active_threshold'),
}

type Staker = StakerBalance & {
  votingPowerPercent: number
}

export const topStakers: ContractFormula<Staker[] | undefined> = {
  compute: async (env) => {
    const stakingContractAddress = await stakingContract.compute(env)
    if (!stakingContractAddress) {
      return
    }

    // Get top stakers.
    const topStakers = await cw20StakeTopStakers.compute({
      ...env,
      contractAddress: stakingContractAddress,
    })

    // Get total power.
    const totalVotingPower = Number(await totalPower.compute(env))

    // Compute voting power for each staker.
    const stakers = topStakers.map((staker) => ({
      ...staker,
      votingPowerPercent:
        totalVotingPower === 0
          ? 0
          : (Number(staker.balance) / totalVotingPower) * 100,
    }))

    return stakers
  },
}
