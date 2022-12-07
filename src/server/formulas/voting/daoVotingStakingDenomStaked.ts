import { Formula } from '../../types'

// TODO: Index bank module, and then write votingPower and totalPower.

export const dao: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'dao')

export const stakingModule: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'staking_module')
