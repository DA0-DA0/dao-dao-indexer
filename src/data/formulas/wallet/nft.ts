import { WalletFormula } from '@/core'

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

    return Array.from(new Set(cw721Contracts))
  },
}
