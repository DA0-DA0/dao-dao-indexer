import { Formula } from '../../types'
import { stakedBalance, totalStaked } from '../staking/cw20Stake'

export const tokenContract: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'token')

export const stakingContract: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'staking_contract')

export const votingPower: Formula<string, { address: string }> = async (
  env
) => {
  const stakingContractAddress = (await stakingContract(env)) ?? ''
  const power = await stakedBalance({
    ...env,
    contractAddress: stakingContractAddress,
  })

  return power || '0'
}

export const totalPower: Formula<string> = async (env) => {
  const stakingContractAddress = (await stakingContract(env)) ?? ''
  const power = await totalStaked({
    ...env,
    contractAddress: stakingContractAddress,
  })

  return power || '0'
}

export const dao: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'dao')

// TODO: isActive

export const activeThreshold: Formula = async ({ contractAddress, get }) =>
  await get(contractAddress, 'active_threshold')
