import { ContractFormula } from '@/core'

import {
  StakerBalance,
  topStakers as cw20StakeTopStakers,
  stakedBalance,
  totalStaked,
} from '../staking/cw20Stake'

const CODE_IDS_KEYS = ['dao-voting-cw20-staked']

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
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
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
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
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
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) => {
    const stakingContractAddress = await stakingContract.compute(env)
    if (!stakingContractAddress) {
      return
    }

    // Validate staking contract code ID matches filter.
    if (
      cw20StakeTopStakers.filter?.codeIdsKeys &&
      !(await env.contractMatchesCodeIdKeys(
        stakingContractAddress,
        ...cw20StakeTopStakers.filter.codeIdsKeys
      ))
    ) {
      throw new Error(
        `staking contract ${stakingContractAddress} had unexpected code ID for dao-voting-cw20-staked contract ${env.contractAddress}`
      )
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
