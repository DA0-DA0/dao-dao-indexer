import { ContractFormula } from '../../types'
import { ContractInfo } from '../types'

export const info: ContractFormula<ContractInfo | undefined> = async ({
  contractAddress,
  getTransformationMatch,
}) =>
  (await getTransformationMatch<ContractInfo>(contractAddress, 'info'))?.value

export const instantiatedAt: ContractFormula<string | undefined> = async ({
  contractAddress,
  getDateFirstTransformed,
}) => (await getDateFirstTransformed(contractAddress, 'info'))?.toISOString()
