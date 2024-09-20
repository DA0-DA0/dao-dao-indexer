import groupBy from 'lodash.groupby'

import { AccountFormula } from '@/types'

import { info } from '../contract/common'
import { tokens } from '../contract/external/cw721'
import { config } from '../contract/voting/daoVotingCw721Staked'

type CollectionWithTokens = {
  collectionAddress: string
  tokens: string[]
}

export const collections: AccountFormula<CollectionWithTokens[]> = {
  compute: async (env) => {
    const { address: walletAddress, getTransformationMatches } = env

    // Potential NFT contracts where the wallet address has tokens.
    const matchingContracts =
      (
        await getTransformationMatches(
          undefined,
          `tokenOwner:${walletAddress}:*`
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

export const stakedWithDaos: AccountFormula<CollectionWithTokens[]> = {
  compute: async (env) => {
    const { address: walletAddress, getTransformationMatches, getCodeIdsForKeys } = env

    // NFT voting contracts where the wallet address has staked tokens.
    const daoVotingCw721StakedCodeIds = getCodeIdsForKeys(
      'dao-voting-cw721-staked'
    )
    const contractsWithTokens =
      (
        await getTransformationMatches(
          undefined,
          `stakedNft:${walletAddress}:*`,
          undefined,
          daoVotingCw721StakedCodeIds.length > 0
            ? daoVotingCw721StakedCodeIds
            : undefined
        )
      )?.map(({ contractAddress, name }) => ({
        votingContract: contractAddress,
        tokenId: name.replace(`stakedNft:${walletAddress}:`, ''),
      })) ?? []

    const uniqueVotingContracts = Array.from(
      new Set(contractsWithTokens.map(({ votingContract }) => votingContract))
    )

    const tokensGroupedByVotingContract = groupBy(
      contractsWithTokens,
      'votingContract'
    )

    // Get NFT collection address from each contract's config.
    const collectionAddresses = await Promise.all(
      uniqueVotingContracts.map(
        async (contractAddress) =>
          (
            await config.compute({
              ...env,
              contractAddress,
            })
          )?.nft_address
      )
    )

    const collections = uniqueVotingContracts
      .map((votingContract, index) => ({
        collectionAddress: collectionAddresses[index],
        tokens: tokensGroupedByVotingContract[votingContract]?.map(
          ({ tokenId }) => tokenId
        ),
      }))
      .filter(
        (collection): collection is CollectionWithTokens =>
          !!collection.collectionAddress
      )

    return collections
  },
}
