import { ContractFormula } from '../../../types'
import { stakedBalance, totalStaked } from '../staking/cw20Stake'

export const tokenContract: ContractFormula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'token')

export const stakingContract: ContractFormula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'staking_contract')

export const votingPower: ContractFormula<string, { address: string }> = async (
  env
) => {
  const stakingContractAddress = (await stakingContract(env)) ?? ''
  const power = await stakedBalance({
    ...env,
    contractAddress: stakingContractAddress,
  })

  return power || '0'
}

export const totalPower: ContractFormula<string> = async (env) => {
  const stakingContractAddress = (await stakingContract(env)) ?? ''
  const power = await totalStaked({
    ...env,
    contractAddress: stakingContractAddress,
  })

  return power || '0'
}

export const dao: ContractFormula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'dao')

// TODO: isActive

export const activeThreshold: ContractFormula = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'active_threshold')
