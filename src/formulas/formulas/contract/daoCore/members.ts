import { ContractFormula } from '@/types'

import { info } from '../common'
import {
  listMembers as listCw4Members,
  totalWeight as totalCw4Weight,
} from '../external/cw4Group'
import { topStakers as topCw20Stakers } from '../voting/daoVotingCw20Staked'
import { groupContract } from '../voting/daoVotingCw4'
import { topStakers as topCw721Stakers } from '../voting/daoVotingCw721Staked'
import { topStakers as topNativeStakers } from '../voting/daoVotingNativeStaked'
import { topStakers as topOnftStakers } from '../voting/daoVotingOnftStaked'
import { allVotersWithVotingPower as sgCommunityAllVoters } from '../voting/daoVotingSgCommunityNft'
import { topStakers as topTokenStakers } from '../voting/daoVotingTokenStaked'
import { config, votingModule } from './base'
import { DAO_CORE_CONTRACT_NAMES, getUniqueSubDaosInTree } from './utils'

export type DaoMember = {
  address: string
  votingPowerPercent: number
}

// Count of unique members in the DAO and SubDAOs if `recursive` is enabled.
// `recursive` follows the same rules as in `allMembers`.
export const memberCount: ContractFormula<
  number,
  {
    recursive?: string
  }
> = {
  docs: {
    description:
      'count of unique members in the DAO and optionally its SubDAOs',
    args: [
      {
        name: 'recursive',
        description: 'whether or not to recurse into SubDAOs. defaults to true',
        required: false,
        schema: {
          type: 'boolean',
        },
      },
    ],
  },
  compute: async (env) => {
    const memberTree = await allMembers.compute(env)
    const uniqueMembers = new Set(
      Object.values(memberTree)
        .flatMap(({ members }) => members)
        .map(({ address }) => address)
    )
    return uniqueMembers.size
  },
}

export const allMembers: ContractFormula<
  Record<
    string,
    {
      name: string | undefined
      members: DaoMember[]
    }
  >,
  {
    // Whether or not to recurse into SubDAOs. Defaults to false. `true` or `1`
    // means recurse, anything else means don't recurse.
    recursive?: string
  }
> = {
  docs: {
    description: 'retrieves all members of the DAO and optionally its SubDAOs',
    args: [
      {
        name: 'recursive',
        description:
          'whether or not to recurse into SubDAOs. defaults to false',
        required: false,
        schema: {
          type: 'boolean',
        },
      },
    ],
  },
  compute: async (env) => {
    const daos = [
      env.contractAddress,
      // Add SubDAOs if `recursive` is enabled.
      ...(env.args.recursive === 'true' || env.args.recursive === '1'
        ? await getUniqueSubDaosInTree(env, env.contractAddress)
        : []),
    ]

    const _allMembers: Record<
      string,
      {
        name: string | undefined
        members: DaoMember[]
      }
    > = {}

    for (const dao of daos) {
      // Get info.
      const daoInfo = await info
        .compute({
          ...env,
          contractAddress: dao,
        })
        .catch(() => null)

      // If invalid DAO, skip.
      if (
        !daoInfo ||
        !DAO_CORE_CONTRACT_NAMES.some((name) => daoInfo.contract.includes(name))
      ) {
        continue
      }

      // Get config.
      const daoConfig = await config
        .compute({
          ...env,
          contractAddress: dao,
        })
        .catch(() => null)

      // If can't load DAO config, skip.
      if (!daoConfig) {
        continue
      }

      // Get members.
      const members = await listMembers.compute({
        ...env,
        contractAddress: dao,
      })

      _allMembers[dao] = {
        name: daoConfig?.name,
        members: members ?? [],
      }
    }

    return _allMembers
  },
}

export const listMembers: ContractFormula<DaoMember[]> = {
  docs: {
    description:
      'lists all members of the DAO with their voting power percentages',
  },
  compute: async (env) => {
    const { contractMatchesCodeIdKeys } = env

    // Get members.
    const votingModuleAddress = await votingModule.compute(env)
    if (!votingModuleAddress) {
      throw new Error('missing `votingModuleAddress`')
    }

    if (
      await contractMatchesCodeIdKeys(votingModuleAddress, 'dao-voting-cw4')
    ) {
      const cw4Group = await groupContract.compute({
        ...env,
        contractAddress: votingModuleAddress,
      })
      if (cw4Group) {
        const totalWeight = await totalCw4Weight.compute({
          ...env,
          contractAddress: cw4Group,
        })
        const members = await listCw4Members.compute({
          ...env,
          contractAddress: cw4Group,
        })

        return members.map(({ addr, weight }) => ({
          address: addr,
          votingPowerPercent: totalWeight ? (weight / totalWeight) * 100 : 0,
        }))
      }
    } else if (
      await contractMatchesCodeIdKeys(
        votingModuleAddress,
        'dao-voting-cw20-staked'
      )
    ) {
      const stakers = await topCw20Stakers.compute({
        ...env,
        contractAddress: votingModuleAddress,
      })

      if (stakers) {
        return stakers.map(({ address, votingPowerPercent }) => ({
          address,
          votingPowerPercent,
        }))
      }
    } else if (
      await contractMatchesCodeIdKeys(
        votingModuleAddress,
        'dao-voting-cw721-staked'
      )
    ) {
      const stakers = await topCw721Stakers.compute({
        ...env,
        contractAddress: votingModuleAddress,
      })

      return stakers.map(({ address, votingPowerPercent }) => ({
        address,
        votingPowerPercent,
      }))
    } else if (
      await contractMatchesCodeIdKeys(
        votingModuleAddress,
        'dao-voting-onft-staked'
      )
    ) {
      const stakers = await topOnftStakers.compute({
        ...env,
        contractAddress: votingModuleAddress,
      })

      return stakers.map(({ address, votingPowerPercent }) => ({
        address,
        votingPowerPercent,
      }))
    } else if (
      await contractMatchesCodeIdKeys(
        votingModuleAddress,
        'dao-voting-native-staked'
      )
    ) {
      const stakers = await topNativeStakers.compute({
        ...env,
        contractAddress: votingModuleAddress,
      })

      if (stakers) {
        return stakers.map(({ address, votingPowerPercent }) => ({
          address,
          votingPowerPercent,
        }))
      }
    } else if (
      await contractMatchesCodeIdKeys(
        votingModuleAddress,
        'dao-voting-token-staked'
      )
    ) {
      const stakers = await topTokenStakers.compute({
        ...env,
        contractAddress: votingModuleAddress,
      })

      if (stakers) {
        return stakers.map(({ address, votingPowerPercent }) => ({
          address,
          votingPowerPercent,
        }))
      }
    } else if (
      await contractMatchesCodeIdKeys(
        votingModuleAddress,
        'dao-voting-sg-community-nft'
      )
    ) {
      const voters = await sgCommunityAllVoters.compute({
        ...env,
        contractAddress: votingModuleAddress,
      })

      return voters.map(({ address, votingPowerPercent }) => ({
        address,
        votingPowerPercent,
      }))
    }

    throw new Error('voting module passthrough not supported for this DAO')
  },
}

// Date membership was last updated for a member-based DAO.
export const lastMembershipChange: ContractFormula<string | null> = {
  docs: {
    description:
      'retrieves the date membership was last updated for a member-based DAO',
  },
  compute: async (env) => {
    // Get members.
    const votingModuleAddress = await votingModule.compute(env)

    if (
      !votingModuleAddress ||
      !(await env.contractMatchesCodeIdKeys(
        votingModuleAddress,
        'dao-voting-cw4'
      ))
    ) {
      throw new Error(
        `lastMembershipChange is only supported for member-based DAOs`
      )
    }

    const cw4Group = await groupContract.compute({
      ...env,
      contractAddress: votingModuleAddress,
    })

    const lastChanged = (
      await env.getTransformationMatches(cw4Group, 'member:*')
    )
      ?.map(({ block }) => Number(block.timeUnixMs))
      .sort()
      .pop()

    return lastChanged ? new Date(lastChanged).toISOString() : null
  },
}
