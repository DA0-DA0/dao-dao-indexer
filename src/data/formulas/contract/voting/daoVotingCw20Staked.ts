import { ContractFormula } from '@/core'

import { stakedBalance, totalStaked } from '../staking/cw20Stake'

export const tokenContract: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'token'),
}

export const stakingContract: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'staking_contract'),
}

export const votingPower: ContractFormula<string, { address: string }> = {
  compute: async (env) => {
    if (!env.args.address) {
      throw new Error('missing `address`')
    }

    const stakingContractAddress = (await stakingContract.compute(env)) ?? ''
    const power = await stakedBalance.compute({
      ...env,
      contractAddress: stakingContractAddress,
    })

    return power || '0'
  },
}

export const totalPower: ContractFormula<string> = {
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
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'dao'),
}

// TODO: isActive

export const activeThreshold: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'active_threshold'),
}
