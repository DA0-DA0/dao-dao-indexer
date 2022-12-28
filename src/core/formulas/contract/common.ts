import { ContractFormula } from '../../types'
import { ContractInfo } from '../types'

export const info: ContractFormula<ContractInfo | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'contract_info')

export const instantiatedAt: ContractFormula<string | undefined> = async ({
  contractAddress,
  getDateKeyFirstSet,
}) =>
  (await getDateKeyFirstSet(contractAddress, 'contract_info'))?.toISOString()
