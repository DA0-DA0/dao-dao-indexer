import { ContractFormula } from '@/types'

export const remoteAddress: ContractFormula<
  string | null,
  { address: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    get,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return (
      (
        await getTransformationMatch<string>(
          contractAddress,
          `remoteAddress:${contractAddress}`
        )
      )?.value ??
      (await get<string>(contractAddress, 'polytone-account-map', address)) ??
      null
    )
  },
}
