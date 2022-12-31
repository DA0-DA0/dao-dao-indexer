import { ContractFormula } from '@/core'

// TODO: Index bank module, and then write votingPower and totalPower.

export const dao: ContractFormula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'dao')

export const stakingModule: ContractFormula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'staking_module')
