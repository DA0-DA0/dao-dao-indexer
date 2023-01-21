import { ContractFormula } from '@/core'

export const info: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'vesting_payment'),
}
