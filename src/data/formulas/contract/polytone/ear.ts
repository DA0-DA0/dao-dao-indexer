import { ContractFormula } from '@/core'

export const result: ContractFormula<any, { address: string; id: string }> = {
  compute: async ({ contractAddress, get, args: { address, id } }) => {
    if (!address) {
      throw new Error('Missing address')
    }
    if (!id) {
      throw new Error('Missing id')
    }

    return await get<string>(contractAddress, 'results', address, id)
  },
}
