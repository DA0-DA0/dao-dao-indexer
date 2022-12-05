import { Formula } from '../types'

export const groupContract: Formula<string> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'group_contract')
