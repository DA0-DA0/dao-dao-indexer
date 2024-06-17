import { ContractFormula } from '@/core/types'

export const activeThreshold: ContractFormula = {
  compute: async ({ contractAddress, get, getTransformationMatch }) =>
    (await getTransformationMatch(contractAddress, 'activeThreshold'))?.value ||
    (await get(contractAddress, 'active_threshold')),
}
