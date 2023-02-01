import { WalletFormula } from '@/core'

import { info } from '../contract/common'

export const collections: WalletFormula<string[]> = {
  compute: async (env) => {
    const { walletAddress, getTransformationMatches } = env

    // NFT contracts where the wallet address has tokens.
    const cw721Contracts =
      (
        await getTransformationMatches(
          undefined,
          `tokenOwner:${walletAddress}:%`
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    const uniqueAddresses = Array.from(new Set(cw721Contracts))

    // Filter by those with 721 in the contract name.
    const cw721ContractInfos = await Promise.all(
      uniqueAddresses.map((contractAddress) =>
        info.compute({
          ...env,
          contractAddress,
        })
      )
    )

    return uniqueAddresses.filter((_, index) =>
      cw721ContractInfos[index]?.contract?.includes('721')
    )
  },
}
