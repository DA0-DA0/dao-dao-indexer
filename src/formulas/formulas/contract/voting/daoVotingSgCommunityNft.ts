import { ContractFormula } from '@/types'

import { TotalPowerAtHeight, VotingPowerAtHeight } from '../../types'
import { makeSimpleContractFormula } from '../../utils'

const CODE_IDS_KEYS = ['dao-voting-sg-community-nft']

export const dao = makeSimpleContractFormula<string>({
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  transformation: 'dao',
})

export const nftContract = makeSimpleContractFormula({
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  transformation: 'nft',
})

export const votingPowerAtHeight: ContractFormula<
  VotingPowerAtHeight,
  { address: string }
> = {
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
  filter: votingPowerAtHeight.filter,
  compute: async (env) => (await votingPowerAtHeight.compute(env)).power,
}

export const totalPowerAtHeight: ContractFormula<TotalPowerAtHeight> = {
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
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
  },
  compute: async ({
    contractAddress,
    getTransformationMap,
    args: { limit, startAfter },
  }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const voterMap =
      (await getTransformationMap<string, any>(contractAddress, 'vt')) ?? {}
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
      (await getTransformationMap<string, string>(contractAddress, 'vp')) ?? {}
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
