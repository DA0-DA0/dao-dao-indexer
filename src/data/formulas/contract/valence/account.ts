import { ContractFormula } from '@/core'

export const admin: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'admin'),
}
