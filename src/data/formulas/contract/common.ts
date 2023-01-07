import { ContractFormula } from '@/core'

import { ContractInfo } from '../../types'

export const info: ContractFormula<ContractInfo | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<ContractInfo>(contractAddress, 'info'))
      ?.value,
}

export const instantiatedAt: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getDateFirstTransformed }) =>
    (await getDateFirstTransformed(contractAddress, 'info'))?.toISOString(),
}
