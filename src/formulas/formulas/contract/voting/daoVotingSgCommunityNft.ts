import { ContractFormula } from '@/types'

import { TotalPowerAtHeight, VotingPowerAtHeight } from '../../types'
import { makeSimpleContractFormula } from '../../utils'

const CODE_IDS_KEYS = ['dao-voting-sg-community-nft']

export const dao = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the DAO address associated with the contract',
  },
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  transformation: 'dao',
})

export const nftContract = makeSimpleContractFormula({
  docs: {
    description:
      'retrieves the NFT contract address associated with the contract',
  },
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  transformation: 'nft',
})

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
        (await getTransformationMatch<string>(contractAddress, `vp:${address}`))
          ?.value || '0',
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
      (await getTransformationMatch<string>(contractAddress, 'tvp'))?.value ||
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

export const registeredNft: ContractFormula<
  {
    token_id: string | null
  },
  {
    address: string
  }
> = {
  docs: {
    description: 'retrieves the registered NFT token ID for an address',
    args: [
      {
        name: 'address',
        description: 'address to get registered NFT for',
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
    args: { address },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return {
      token_id:
        (await getTransformationMatch<string>(contractAddress, `vt:${address}`))
          ?.value || null,
    }
  },
}

export const listVoters: ContractFormula<
  {
    voters: string[]
  },
  {
    limit?: string
    startAfter?: string
  }
> = {
  docs: {
    description: 'retrieves a list of voters',
    args: [
      {
        name: 'limit',
        description: 'maximum number of voters to return',
        required: false,
        schema: {
          type: 'integer',
        },
      },
      {
        name: 'startAfter',
        description: 'address to start after in the list',
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
    args: { limit, startAfter },
  }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const voterMap = (await getTransformationMap(contractAddress, 'vt')) ?? {}
    const voters = Object.keys(voterMap)
      // Ascending by voter address.
      .sort((a, b) => a.localeCompare(b))
      .filter((voter) => !startAfter || voter.localeCompare(startAfter) > 0)
      .slice(0, limitNum)

    return {
      voters,
    }
  },
}

type Voter = {
  address: string
  weight: number
  votingPowerPercent: number
}

export const allVotersWithVotingPower: ContractFormula<
  Voter[],
  {
    limit?: string
  }
> = {
  docs: {
    description: 'retrieves all voters with their voting power',
    args: [
      {
        name: 'limit',
        description: 'maximum number of voters to return',
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

    const voterMap =
      (await getTransformationMap<string>(contractAddress, 'vp')) ?? {}
    const voterEntries = Object.entries(voterMap)
      // Ascending by voter address.
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, limitNum)

    // Get total power.
    const totalVotingPower = Number(
      (await totalPowerAtHeight.compute(env)).power
    )

    // Compute voting power percent for each voter.
    const voters = voterEntries.map(
      ([address, weight]): Voter => ({
        address,
        weight: Number(weight),
        votingPowerPercent:
          totalVotingPower === 0
            ? 0
            : (Number(weight) / totalVotingPower) * 100,
      })
    )

    return voters
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
