import { Formula } from '../types'
import { ContractInfo } from './types'

export const info: Formula<ContractInfo | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'contract_info')

export const instantiatedAt: Formula<string | undefined> = async ({
  contractAddress,
  getDateKeyFirstSet,
}) =>
  (await getDateKeyFirstSet(contractAddress, 'contract_info'))?.toISOString()
