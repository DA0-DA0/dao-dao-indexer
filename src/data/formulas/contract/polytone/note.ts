import { ContractFormula } from '@/core'

export const remoteAddress: ContractFormula<
  string | undefined,
  { address: string }
> = {
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('Missing address')
    }

    return await get<string>(contractAddress, 'polytone-l2r', address)
  },
}
