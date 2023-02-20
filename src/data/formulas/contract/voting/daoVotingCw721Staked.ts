import { ContractFormula } from '@/core'

type Config = {
  owner?: string | null
  nft_address: string
  unstaking_duration?: any
}

const CODE_IDS_KEYS = ['dao-voting-cw721-staked']

export const config: ContractFormula<Config | undefined> = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<Config>(contractAddress, 'config'))?.value,
}

export const dao: ContractFormula<string | undefined> = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'dao'))?.value,
}

export const nftClaims: ContractFormula<any[], { address: string }> = {
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return (await get(contractAddress, 'nft_claims', address)) ?? []
  },
}

export const votingPower: ContractFormula<string, { address: string }> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return (
      (
        await getTransformationMatch<string>(
          contractAddress,
          `stakedCount:${address}`
        )
      )?.value || '0'
    )
  },
}

export const totalPower: ContractFormula<string> = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'tsn'))?.value ||
    '0',
}

export const stakedNfts: ContractFormula<
  any[],
  {
    address: string
    limit?: string
    startAfter?: string
  }
> = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({
    contractAddress,
    getTransformationMap,
    args: { address, limit, startAfter },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const stakedNfts =
      (await getTransformationMap<string, any>(
        contractAddress,
        `stakedNft:${address}`
      )) ?? {}
    const tokenIds = Object.keys(stakedNfts)
      // Ascending by token ID.
      .sort((a, b) => a.localeCompare(b))
      .filter((voter) => !startAfter || voter.localeCompare(startAfter) > 0)
      .slice(0, limitNum)

    return tokenIds
  },
}

export const staker: ContractFormula<string | undefined, { tokenId: string }> =
  {
    filter: {
      codeIdsKeys: CODE_IDS_KEYS,
    },
    compute: async ({
      contractAddress,
      getTransformationMatch,
      args: { tokenId },
    }) => {
      if (!tokenId) {
        throw new Error('missing `tokenId`')
      }

      const owner = (
        await getTransformationMatch<string>(
          contractAddress,
          `stakedNftOwner:${tokenId}`
        )
      )?.value

      return owner
    },
  }

type Staker = {
  address: string
  count: number
  votingPowerPercent: number
}

export const topStakers: ContractFormula<
  Staker[],
  {
    limit?: string
  }
> = {
  compute: async (env) => {
    const {
      contractAddress,
      getTransformationMap,
      args: { limit },
    } = env

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const stakedCountMap =
      (await getTransformationMap<string, string>(
        contractAddress,
        'stakedCount'
      )) ?? {}
    const stakedCounts = Object.entries(stakedCountMap)
      // Remove zero counts.
      .filter(([, stakedCount]) => Number(stakedCount) > 0)
      // Descending by count.
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, limitNum)

    // Get total power.
    const totalVotingPower = Number(await totalPower.compute(env))

    // Compute voting power for each staker.
    const stakers = stakedCounts.map(
      ([address, count]): Staker => ({
        address,
        count: Number(count),
        votingPowerPercent:
          totalVotingPower === 0 ? 0 : (Number(count) / totalVotingPower) * 100,
      })
    )

    return stakers
  },
}
