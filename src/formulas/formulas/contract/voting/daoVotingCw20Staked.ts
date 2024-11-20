import { ContractFormula } from '@/types'

import { TotalPowerAtHeight, VotingPowerAtHeight } from '../../types'
import { makeSimpleContractFormula } from '../../utils'
import {
  StakerBalance,
  topStakers as cw20StakeTopStakers,
  stakedBalance,
  totalStaked,
} from '../staking/cw20Stake'

const CODE_IDS_KEYS = ['dao-voting-cw20-staked']

export { activeThreshold } from './common'

export const tokenContract = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the token contract address',
  },
  transformation: 'token',
  fallbackKeys: ['token'],
})

export const stakingContract = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the staking contract address',
  },
  transformation: 'stakingContract',
  fallbackKeys: ['staking_contract'],
})

export const votingPowerAtHeight: ContractFormula<
  VotingPowerAtHeight,
  { address: string; height?: string }
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

    const stakingContractAddress = await stakingContract.compute(env)
    if (!stakingContractAddress) {
      throw new Error('missing `stakingContractAddress`')
    }

    // Unrecognized contract.
    if (
      !(await env.contractMatchesCodeIdKeys(
        stakingContractAddress,
        ...(stakedBalance.filter?.codeIdsKeys ?? [])
      ))
    ) {
      throw new Error(`unsupported staking contract: ${stakingContractAddress}`)
    }

    const power =
      (await stakedBalance.compute({
        ...env,
        contractAddress: stakingContractAddress,
      })) || '0'

    const height = env.args.height
      ? Number(env.args.height)
      : Number(env.block.height)

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
    const stakingContractAddress = (await stakingContract.compute(env)) ?? ''
    const power =
      (await totalStaked.compute({
        ...env,
        contractAddress: stakingContractAddress,
      })) || '0'

    const height = env.args.height
      ? Number(env.args.height)
      : Number(env.block.height)

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
  fallbackKeys: ['dao'],
})

type Staker = StakerBalance & {
  votingPowerPercent: number
}

export const topStakers: ContractFormula<Staker[]> = {
  docs: {
    description: 'retrieves the top stakers sorted by voting power',
  },
  compute: async (env) => {
    const stakingContractAddress = await stakingContract.compute(env)
    if (!stakingContractAddress) {
      throw new Error('missing `stakingContractAddress`')
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
