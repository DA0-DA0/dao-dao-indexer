import { ContractFormula } from '@/core'

export const remoteController: ContractFormula<
  string | undefined,
  { address: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('Missing address')
    }

    return (
      await getTransformationMatch<string>(
        contractAddress,
        `remoteController:${address}`
      )
    )?.value
  },
}
