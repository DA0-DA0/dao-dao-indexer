import { Formula } from '../types'

export interface ContractInfo {
  contract: string
  version: string
}

export const info: Formula = async ({ contractAddress, get }) =>
  await get<ContractInfo>(contractAddress, 'contract_info')
