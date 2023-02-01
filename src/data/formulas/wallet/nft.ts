import { WalletFormula } from '@/core'

import { info } from '../contract/common'
import { tokens } from '../contract/external/cw721'

type CollectionWithTokens = {
  collectionAddress: string
  tokens: string[]
}

export const collections: WalletFormula<CollectionWithTokens[]> = {
  compute: async (env) => {
    const { walletAddress, getTransformationMatches } = env

    // Potential NFT contracts where the wallet address has tokens.
    const matchingContracts =
      (
        await getTransformationMatches(
          undefined,
          `tokenOwner:${walletAddress}:%`
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    const uniqueAddresses = Array.from(new Set(matchingContracts))

    // Filter by those with 721 in the contract name.
    const cw721ContractInfos = await Promise.all(
      uniqueAddresses.map((contractAddress) =>
        info.compute({
          ...env,
          contractAddress,
        })
      )
    )

    const cw721Contracts = uniqueAddresses.filter((_, index) =>
      cw721ContractInfos[index]?.contract?.includes('721')
    )

    // Get all tokens for each contract.
    const collections = await Promise.all(
      cw721Contracts.map(
        async (collectionAddress): Promise<CollectionWithTokens> => ({
          collectionAddress,
          tokens: await tokens.compute({
            ...env,
            contractAddress: collectionAddress,
            args: {
              owner: walletAddress,
            },
          }),
        })
      )
    )

    return collections
  },
}
