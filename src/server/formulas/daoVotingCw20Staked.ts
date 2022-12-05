import { Formula } from '../types'

export const tokenContract: Formula<string> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'token')

export const stakingContract: Formula<string> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'staking_contract')
