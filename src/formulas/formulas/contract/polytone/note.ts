import { ContractFormula } from '@/core'

export const remoteAddress: ContractFormula<
  string | undefined,
  { address: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    get,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('Missing address')
    }

    return (
      (
        await getTransformationMatch<string>(
          contractAddress,
          `remoteAddress:${contractAddress}`
        )
      )?.value ??
      (await get<string>(contractAddress, 'polytone-account-map', address))
    )
  },
}
