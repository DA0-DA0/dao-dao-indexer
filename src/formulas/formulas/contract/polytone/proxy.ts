import { ContractFormula } from '@/core'

export const instantiator: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get<string>(contractAddress, 'owner'),
}
