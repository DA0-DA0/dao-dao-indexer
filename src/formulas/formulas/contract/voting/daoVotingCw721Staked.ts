import { ContractFormula } from '@/types'

import {
  Expiration,
  TotalPowerAtHeight,
  VotingPowerAtHeight,
} from '../../types'
import { makeSimpleContractFormula } from '../../utils'

type Config = {
  owner?: string | null
  nft_address: string
  unstaking_duration?: any
}

const CODE_IDS_KEYS = ['dao-voting-cw721-staked']

export { activeThreshold } from './common'

export const config = makeSimpleContractFormula<Config>({
  docs: {
    description: 'retrieves the configuration of the contract',
  },
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  transformation: 'config',
})

export const dao = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the DAO address associated with the contract',
  },
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  transformation: 'dao',
})

type NftClaim = {
  token_id: string
  release_at: Expiration
  legacy: boolean
}

export const nftClaims: ContractFormula<NftClaim[], { address: string }> = {
  docs: {
    description: 'retrieves the NFT claims for a given address',
    args: [
      {
        name: 'address',
        description: 'address to get NFT claims for',
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  compute: async ({
    contractAddress,
    get,
    getTransformationMap,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    const legacyClaims = (
      (await get<Omit<NftClaim, 'legacy'>[]>(
        contractAddress,
        'nft_claims',
        address
      )) ?? []
    ).map((claim) => ({
      ...claim,
      legacy: true,
    }))

    const claims = Object.entries(
      (await getTransformationMap<string, Expiration>(
        contractAddress,
        `claim:${address}`
      )) ?? {}
    ).map(
      ([token_id, release_at]): NftClaim => ({
        token_id,
        release_at,
        legacy: false,
      })
    )

    return [...legacyClaims, ...claims]
  },
}

export const votingPowerAtHeight: ContractFormula<
  VotingPowerAtHeight,
  { address: string }
> = {
  docs: {
    description:
      'retrieves the voting power for an address at a specific block height',
    args: [
      {
        name: 'address',
        description: 'address to get voting power for',
        required: true,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'block',
        description: 'block height to get voting power at',
        required: true,
        schema: {
          type: 'integer',
        },
      },
    ],
  },
  // Filter by code ID since someone may modify the contract. This is also used
  // in DAO core to match the voting module and pass the query through.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { address },
    block,
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return {
      power:
        (
          await getTransformationMatch<string>(
            contractAddress,
            `stakedCount:${address}`
          )
        )?.value || '0',
      height: Number(block.height),
    }
  },
}

export const votingPower: ContractFormula<string, { address: string }> = {
  docs: {
    description:
      'retrieves the voting power for an address at the current block height',
    args: [
      {
        name: 'address',
        description: 'address to get voting power for',
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  filter: votingPowerAtHeight.filter,
  compute: async (env) => (await votingPowerAtHeight.compute(env)).power,
}

export const totalPowerAtHeight: ContractFormula<TotalPowerAtHeight> = {
  docs: {
    description: 'retrieves the total voting power at a specific block height',
    args: [
      {
        name: 'block',
        description: 'block height to get total power at',
        required: true,
        schema: {
          type: 'integer',
        },
      },
    ],
  },
  // Filter by code ID since someone may modify the contract. This is also used
  // in DAO core to match the voting module and pass the query through.
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({ contractAddress, getTransformationMatch, block }) => ({
    power:
      (await getTransformationMatch<string>(contractAddress, 'tsn'))?.value ||
      '0',
    height: Number(block.height),
  }),
}

export const totalPower: ContractFormula<string> = {
  docs: {
    description: 'retrieves the total voting power at the current block height',
  },
  filter: totalPowerAtHeight.filter,
  compute: async (env) => (await totalPowerAtHeight.compute(env)).power,
}

export const stakedNfts: ContractFormula<
  any[],
  {
    address: string
    limit?: string
    startAfter?: string
  }
> = {
  docs: {
    description: 'retrieves the staked NFTs for a given address',
    args: [
      {
        name: 'address',
        description: 'address to get staked NFTs for',
        required: true,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'limit',
        description: 'maximum number of NFTs to return',
        required: false,
        schema: {
          type: 'integer',
        },
      },
      {
        name: 'startAfter',
        description: 'token ID to start after in the list',
        required: false,
        schema: {
          type: 'string',
        },
      },
    ],
  },
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

export const staker: ContractFormula<string, { tokenId: string }> = {
  docs: {
    description: 'retrieves the staker address for a given token ID',
    args: [
      {
        name: 'tokenId',
        description: 'token ID to get staker for',
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
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

    if (!owner) {
      throw new Error('token ID not found')
    }

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
  docs: {
    description: 'retrieves the top stakers sorted by voting power',
    args: [
      {
        name: 'limit',
        description: 'maximum number of stakers to return',
        required: false,
        schema: {
          type: 'integer',
        },
      },
    ],
  },
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
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

// Map NFT token ID to staker.
export const ownersOfStakedNfts: ContractFormula<Record<string, string>> = {
  docs: {
    description: 'retrieves a mapping of NFT token IDs to their stakers',
  },
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async (env) => {
    const { contractAddress, getTransformationMap } = env

    const stakedCountMap =
      (await getTransformationMap<string, string>(
        contractAddress,
        'stakedCount'
      )) ?? {}
    const stakers = Object.entries(stakedCountMap)
      // Remove zero counts.
      .filter(([, stakedCount]) => Number(stakedCount) > 0)
      .map(([address]) => address)

    const stakedNftsPerStaker = await Promise.all(
      stakers.map(async (address) => ({
        address,
        tokenIds: await stakedNfts.compute({
          ...env,
          args: {
            address,
          },
        }),
      }))
    )

    return stakedNftsPerStaker.reduce(
      (acc, { address, tokenIds }) => ({
        ...acc,
        ...tokenIds.reduce(
          (acc, tokenId) => ({
            ...acc,
            [tokenId]: address,
          }),
          {} as Record<string, string>
        ),
      }),
      {} as Record<string, string>
    )
  },
}

export const hooks = makeSimpleContractFormula<string[], { hooks: string[] }>({
  docs: {
    description: 'retrieves the hooks associated with the contract',
  },
  transformation: 'hooks',
  fallbackKeys: ['hooks'],
  fallback: { hooks: [] },
  transform: (hooks) => ({ hooks }),
})
