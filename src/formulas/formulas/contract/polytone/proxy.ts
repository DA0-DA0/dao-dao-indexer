import { ContractFormula } from '@/types'

export const instantiator: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get<string>(contractAddress, 'owner'),
}
