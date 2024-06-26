import { ContractFormula } from '@/types'

import { TotalPowerAtHeight, VotingPowerAtHeight } from '../../types'
import {
  StakerBalance,
  topStakers as cw20StakeTopStakers,
  stakedBalance,
  totalStaked,
} from '../staking/cw20Stake'

const CODE_IDS_KEYS = ['dao-voting-cw20-staked']

export { activeThreshold } from './common'

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

export const votingPowerAtHeight: ContractFormula<
  VotingPowerAtHeight | undefined,
  { address: string }
> = {
  // Filter by code ID since someone may modify the contract. This is also used
  // in DAO core to match the voting module and pass the query through.
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

    const power =
      (await stakedBalance.compute({
        ...env,
        contractAddress: stakingContractAddress,
      })) || '0'

    return {
      power,
      height: Number(env.block.height),
    }
  },
}

export const votingPower: ContractFormula<
  string | undefined,
  { address: string }
> = {
  filter: votingPowerAtHeight.filter,
  compute: async (env) => (await votingPowerAtHeight.compute(env))?.power,
}

export const totalPowerAtHeight: ContractFormula<TotalPowerAtHeight> = {
  // Filter by code ID since someone may modify the contract. This is also used
  // in DAO core to match the voting module and pass the query through.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) => {
    const stakingContractAddress = (await stakingContract.compute(env)) ?? ''
    const power =
      (await totalStaked.compute({
        ...env,
        contractAddress: stakingContractAddress,
      })) || '0'

    return {
      power,
      height: Number(env.block.height),
    }
  },
}

export const totalPower: ContractFormula<string> = {
  filter: totalPowerAtHeight.filter,
  compute: async (env) => (await totalPowerAtHeight.compute(env)).power,
}

export const dao: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'dao'))?.value ??
    // Fallback to events.
    (await get<string>(contractAddress, 'dao')),
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
