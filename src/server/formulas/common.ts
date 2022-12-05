import { Formula } from '../types'

export interface ContractInfo {
  contract: string
  version: string
}

export const info: Formula<ContractInfo> = async ({ contractAddress, get }) =>
  await get(contractAddress, 'contract_info')
