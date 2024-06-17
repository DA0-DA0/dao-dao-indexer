import { ContractFormula } from '@/types'

import {
  listMembers as listCw4Members,
  totalWeight as totalCw4Weight,
} from '../external/cw4Group'
import { topStakers as topCw20Stakers } from '../voting/daoVotingCw20Staked'
import { groupContract } from '../voting/daoVotingCw4'
import { topStakers as topCw721Stakers } from '../voting/daoVotingCw721Staked'
import { topStakers as topNativeStakers } from '../voting/daoVotingNativeStaked'
import { topStakers as topTokenStakers } from '../voting/daoVotingTokenStaked'
import { config, votingModule } from './base'
import { getUniqueSubDaosInTree } from './utils'

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
    // Whether or not to recurse into SubDAOs. Defaults to true. `true` or `1`
    // means recurse, anything else means don't recurse.
    recursive?: string
  }
> = {
  compute: async (env) => {
    const daos = [
      env.contractAddress,
      // Add SubDAOs if `recursive` is enabled.
      ...(!('recursive' in env.args) ||
      env.args.recursive === 'true' ||
      env.args.recursive === '1'
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
      // Get config.
      const daoConfig = await config.compute({
        ...env,
        contractAddress: dao,
      })

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

export const listMembers: ContractFormula<DaoMember[] | undefined> = {
  compute: async (env) => {
    const { contractMatchesCodeIdKeys } = env

    // Get members.
    const votingModuleAddress = await votingModule.compute(env)
    if (!votingModuleAddress) {
      return
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
    }
  },
}

// Date membership was last updated for a member-based DAO.
export const lastMembershipChange: ContractFormula<string | undefined> = {
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

    return lastChanged ? new Date(lastChanged).toISOString() : undefined
  },
}
