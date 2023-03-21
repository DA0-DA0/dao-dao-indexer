import { ContractFormula } from '@/core'

import { ContractInfo, Expiration, ProposalModule } from '../../../types'
import { isExpirationExpired } from '../../utils'
import { info, instantiatedAt } from '../common'
import { balance } from '../external/cw20'
import {
  listMembers as listCw4Members,
  totalWeight as totalCw4Weight,
} from '../external/cw4Group'
import {
  openProposals as multipleChoiceOpenProposals,
  proposalCount as multipleChoiceProposalCount,
} from '../proposal/daoProposalMultiple'
import {
  openProposals as singleChoiceOpenProposals,
  proposalCount as singleChoiceProposalCount,
} from '../proposal/daoProposalSingle'
import { ProposalResponse } from '../proposal/types'
import {
  totalPower as daoVotingCw20StakedTotalPower,
  votingPower as daoVotingCw20StakedVotingPower,
  topStakers as topCw20Stakers,
} from '../voting/daoVotingCw20Staked'
import {
  totalPower as daoVotingCw4TotalPower,
  votingPower as daoVotingCw4VotingPower,
  groupContract,
} from '../voting/daoVotingCw4'
import {
  totalPower as daoVotingCw721StakedTotalPower,
  votingPower as daoVotingCw721StakedVotingPower,
  topStakers as topCw721Stakers,
} from '../voting/daoVotingCw721Staked'
import { topStakers as topNativeStakers } from '../voting/daoVotingNativeStaked'

interface Config {
  automatically_add_cw20s: boolean
  automatically_add_cw721s: boolean
  dao_uri?: string | null
  description: string
  image_url?: string | null
  name: string
}

interface ProposalModuleWithInfo extends ProposalModule {
  info?: ContractInfo
}

type PausedResponse =
  | {
      Paused: {
        expiration: Expiration
      }
    }
  | {
      Unpaused: {}
    }

interface DumpState {
  // Same as contract query, except `pause_info`. `pause_info` is dynamic by
  // block since it deals with expiration, so it cannot be cached. However, we
  // want to cache DumpState to speed up the UI. The UI accesses `pause_info`
  // separately, so this is fine.
  admin?: string
  config?: Config
  version?: ContractInfo
  proposal_modules?: ProposalModuleWithInfo[]
  voting_module?: string
  active_proposal_module_count: number
  total_proposal_module_count: number
  // Extra.
  votingModuleInfo?: ContractInfo
  createdAt?: string
  adminInfo?: {
    admin?: string
    config: Config
    info?: ContractInfo
    // Check if it has this current DAO as a SubDAO.
    registeredSubDao?: boolean
  } | null
  proposalCount?: number
}

interface Cw20Balance {
  addr: string
  balance?: string
}

interface SubDao {
  addr: string
  charter?: string | null
}

interface InboxItem {
  proposalModuleAddress: string
  proposals: (ProposalResponse<any> & { voted?: boolean })[]
}

const CONTRACT_NAMES = ['cw-core', 'cwd-core', 'dao-core']

export const config: ContractFormula<Config | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch, get }) =>
    (await getTransformationMatch<Config>(contractAddress, 'config'))?.value ??
    // Fallback to events.
    // V2.
    (await get<Config>(contractAddress, 'config_v2')) ??
    // V1.
    (await get<Config>(contractAddress, 'config')),
}

export const proposalModules: ContractFormula<
  ProposalModuleWithInfo[] | undefined
> = {
  compute: async (env) => {
    const { contractAddress, getTransformationMap, getMap } = env

    const proposalModules: ProposalModule[] = []

    const transformedMap = await getTransformationMap<string, ProposalModule>(
      contractAddress,
      'proposalModule'
    )

    // Transformed.
    if (transformedMap) {
      proposalModules.push(...Object.values(transformedMap))
    } else {
      // Fallback to events.
      // V2.
      const proposalModuleMap = await getMap<string, ProposalModule>(
        contractAddress,
        'proposal_modules_v2'
      )
      if (proposalModuleMap) {
        proposalModules.push(...Object.values(proposalModuleMap))
      }
      // V1.
      else {
        const proposalModuleAddresses = Object.keys(
          (await getMap<string, string>(contractAddress, 'proposal_modules')) ??
            {}
        )
        proposalModules.push(
          ...proposalModuleAddresses.map((address) => ({
            address,
            // V1 modules don't have a prefix.
            prefix: '',
            // V1 modules are always enabled.
            status: 'Enabled' as const,
          }))
        )
      }
    }

    // If no proposal modules, this must not be a DAO core contract.
    if (!proposalModules.length) {
      return undefined
    }

    return await Promise.all(
      proposalModules
        // Reverse since the getter returns them in descending order, and v1
        // prefixes are in ascending order.
        .reverse()
        .map(async (data, index): Promise<ProposalModuleWithInfo> => {
          const contractInfo = await info.compute({
            ...env,
            contractAddress: data.address,
          })

          return {
            ...data,
            prefix: data.prefix || indexToProposalModulePrefix(index),
            info: contractInfo,
          }
        })
    )
  },
}

export const activeProposalModules: ContractFormula<
  ProposalModuleWithInfo[] | undefined
> = {
  compute: async (env) => {
    const modules = await proposalModules.compute(env)
    return modules?.filter(
      (module) => module.status === 'enabled' || module.status === 'Enabled'
    )
  },
}

export const dumpState: ContractFormula<DumpState | undefined> = {
  compute: async (env) => {
    // Prefetch all data.
    await env.prefetchTransformations(env.contractAddress, [
      'admin',
      'config',
      'info',
      {
        name: 'proposalModule',
        map: true,
      },
      'votingModule',
      'activeProposalModuleCount',
      'totalProposalModuleCount',
    ])

    const [
      adminResponse,
      configResponse,
      version,
      proposal_modules,
      { address: voting_module, info: votingModuleInfo },
      activeProposalModuleCount,
      totalProposalModuleCount,
      createdAt,
      proposalCountResponse,
    ] = await Promise.all([
      admin.compute(env),
      config.compute(env),
      info.compute(env),
      proposalModules.compute(env),
      votingModule.compute(env).then(async (contractAddress) => ({
        address: contractAddress,
        info: contractAddress
          ? await info.compute({
              ...env,
              contractAddress,
            })
          : undefined,
      })),
      // V2
      env
        .getTransformationMatch<number | undefined>(
          env.contractAddress,
          'activeProposalModuleCount'
        )
        .then(
          (transformation) =>
            transformation?.value ??
            // Fallback to events.
            env.get<number | undefined>(
              env.contractAddress,
              'active_proposal_module_count'
            )
        ),
      env
        .getTransformationMatch<number | undefined>(
          env.contractAddress,
          'totalProposalModuleCount'
        )
        .then(
          (transformation) =>
            transformation?.value ??
            // Fallback to events.
            env.get<number | undefined>(
              env.contractAddress,
              'total_proposal_module_count'
            )
        ),
      // Extra.
      instantiatedAt.compute(env),
      proposalCount.compute(env),
    ])

    // If no config, this must not be a DAO core contract.
    if (!configResponse) {
      return undefined
    }

    // Load admin info if admin is a DAO core contract.
    let adminConfig: Config | undefined | null = null
    let adminInfo: ContractInfo | undefined
    let adminAdmin: string | undefined
    let adminRegisteredSubDao: boolean | undefined
    const adminContractInfo =
      adminResponse && adminResponse !== env.contractAddress
        ? await info.compute({
            ...env,
            contractAddress: adminResponse,
          })
        : undefined
    if (
      adminResponse &&
      adminContractInfo &&
      CONTRACT_NAMES.some((name) => adminContractInfo.contract.includes(name))
    ) {
      adminConfig = await config.compute({
        ...env,
        contractAddress: adminResponse,
      })
      if (adminConfig) {
        adminInfo = await info.compute({
          ...env,
          contractAddress: adminResponse,
        })
        adminAdmin = await admin.compute({
          ...env,
          contractAddress: adminResponse,
        })

        // Check if the current DAO is registered as a SubDAO.
        const adminSubDaos = await listSubDaos.compute({
          ...env,
          contractAddress: adminResponse,
        })
        adminRegisteredSubDao = adminSubDaos.some(
          (subDao) => subDao.addr === env.contractAddress
        )
      }
    }

    return {
      // Same as contract query.
      admin: adminResponse,
      config: configResponse,
      version,
      proposal_modules,
      voting_module,
      // V1 doesn't have these counts; all proposal modules are active.
      active_proposal_module_count:
        activeProposalModuleCount ?? proposal_modules?.length ?? 0,
      total_proposal_module_count:
        totalProposalModuleCount ?? proposal_modules?.length ?? 0,
      // Extra.
      votingModuleInfo,
      createdAt,
      adminInfo: adminConfig && {
        admin: adminAdmin,
        info: adminInfo,
        config: adminConfig,
        registeredSubDao: adminRegisteredSubDao,
      },
      proposalCount: proposalCountResponse,
    }
  },
}

export const paused: ContractFormula<PausedResponse> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const { contractAddress, getTransformationMatch, get } = env

    const expiration =
      (await getTransformationMatch<Expiration>(contractAddress, 'paused'))
        ?.value ??
      // Fallback to events.
      (await get<Expiration | undefined>(contractAddress, 'paused'))

    return !expiration || isExpirationExpired(env, expiration)
      ? { Unpaused: {} }
      : { Paused: { expiration } }
  },
}

export const admin: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch, get }) =>
    (await getTransformationMatch<string>(contractAddress, 'admin'))?.value ??
    // Fallback to events.
    (await get<string>(contractAddress, 'admin')),
}

export const adminNomination: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch, get }) =>
    (await getTransformationMatch<string>(contractAddress, 'nominatedAdmin'))
      ?.value ??
    // Fallback to events.
    (await get<string>(contractAddress, 'nominated_admin')),
}

export const votingModule: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch, get }) =>
    (await getTransformationMatch<string>(contractAddress, 'votingModule'))
      ?.value ??
    // Fallback to events.
    (await get<string>(contractAddress, 'voting_module')),
}

export const item: ContractFormula<string | undefined, { key: string }> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    get,
    args: { key },
  }) => {
    if (!key) {
      throw new Error('missing `key`')
    }

    return (
      (
        await getTransformationMatch<string | undefined>(
          contractAddress,
          `item:${key}`
        )
      )?.value ??
      // Fallback to events.
      (await get<string | undefined>(contractAddress, 'items', key))
    )
  },
}

export const listItems: ContractFormula<[string, string][]> = {
  compute: async ({ contractAddress, getTransformationMap, getMap }) =>
    Object.entries(
      (await getTransformationMap<string>(contractAddress, 'item')) ??
        // Fallback to events.
        (await getMap<string>(contractAddress, 'items')) ??
        {}
    ),
}

export const cw20List: ContractFormula<string[]> = {
  compute: async ({ contractAddress, getTransformationMap, getMap }) =>
    Object.keys(
      (await getTransformationMap<string>(contractAddress, 'cw20')) ??
        // Fallback to events.
        (await getMap<string>(contractAddress, 'cw20s')) ??
        {}
    ),
}

export const cw721List: ContractFormula<string[]> = {
  compute: async ({ contractAddress, getTransformationMap, getMap }) =>
    Object.keys(
      (await getTransformationMap<string>(contractAddress, 'cw721')) ??
        // Fallback to events.
        (await getMap<string>(contractAddress, 'cw721s')) ??
        {}
    ),
}

export const cw20Balances: ContractFormula<Cw20Balance[]> = {
  compute: async (env) => {
    const cw20Addresses = (await cw20List.compute(env)) ?? []

    return await Promise.all(
      cw20Addresses.map(async (addr): Promise<Cw20Balance> => {
        const balanceResponse = await balance.compute({
          ...env,
          contractAddress: addr,
          args: { address: env.contractAddress },
        })

        return {
          addr,
          balance: balanceResponse,
        }
      })
    )
  },
}

export const listSubDaos: ContractFormula<SubDao[]> = {
  compute: async ({ contractAddress, getTransformationMap, getMap }) => {
    // V2. V1 doesn't have sub DAOs; use empty map if undefined.
    const subDaoMap =
      (await getTransformationMap<string, string | undefined>(
        contractAddress,
        'subDao'
      )) ??
      // Fallback to events.
      (await getMap<string, string | undefined>(contractAddress, 'sub_daos')) ??
      {}

    return Object.entries(subDaoMap).map(([addr, charter]) => ({
      addr,
      charter,
    }))
  },
}

export const daoUri: ContractFormula<string> = {
  compute: async (env) => (await config.compute(env))?.dao_uri ?? '',
}

export const votingPower: ContractFormula<
  string | undefined,
  { address: string }
> = {
  compute: async (env) => {
    const votingModuleAddress = (await votingModule.compute(env)) ?? ''
    if (!votingModuleAddress) {
      return
    }

    const codeIdKey = await env.getCodeIdKeyForContract(votingModuleAddress)
    // Unrecognized contract.
    if (!codeIdKey) {
      return
    }

    // Find formula matching code ID key.
    const votingPowerFormula = VOTING_POWER_FORMULAS.find((formula) =>
      formula.filter?.codeIdsKeys?.includes(codeIdKey)
    )
    return await votingPowerFormula?.compute({
      ...env,
      contractAddress: votingModuleAddress,
    })
  },
}

export const totalPower: ContractFormula<string | undefined> = {
  compute: async (env) => {
    const votingModuleAddress = (await votingModule.compute(env)) ?? ''
    if (!votingModuleAddress) {
      return
    }

    const codeIdKey = await env.getCodeIdKeyForContract(votingModuleAddress)
    // Unrecognized contract.
    if (!codeIdKey) {
      return
    }

    // Find formula matching code ID key.
    const totalPowerFormula = TOTAL_POWER_FORMULAS.find((formula) =>
      formula.filter?.codeIdsKeys?.includes(codeIdKey)
    )
    return await totalPowerFormula?.compute({
      ...env,
      contractAddress: votingModuleAddress,
    })
  },
}

// These formulas must have code ID filters set so we can match them.
const VOTING_POWER_FORMULAS: ContractFormula<
  string | undefined,
  { address: string }
>[] = [
  daoVotingCw4VotingPower,
  daoVotingCw20StakedVotingPower,
  daoVotingCw721StakedVotingPower,
]
const TOTAL_POWER_FORMULAS: ContractFormula<string>[] = [
  daoVotingCw4TotalPower,
  daoVotingCw20StakedTotalPower,
  daoVotingCw721StakedTotalPower,
]

// Return open proposals and whether or not the given address voted. If no
// address provided, just return open proposals.
export const openProposals: ContractFormula<
  InboxItem[] | undefined,
  { address?: string }
> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const proposalModules = await activeProposalModules.compute(env)

    if (!proposalModules) {
      return undefined
    }

    return (
      await Promise.all(
        proposalModules.map(
          async ({ address: proposalModuleAddress, info }) => {
            if (!info) {
              return undefined
            }

            const openProposalsFormula =
              OPEN_PROPOSALS_MAP[info.contract.replace('crates.io:', '')]
            const openProposals = await openProposalsFormula?.compute({
              ...env,
              contractAddress: proposalModuleAddress,
            })

            return (
              openProposals && {
                proposalModuleAddress,
                proposals: openProposals,
              }
            )
          }
        )
      )
    ).filter(Boolean) as InboxItem[]
  },
}

// Map contract name to open proposal formula.
const OPEN_PROPOSALS_MAP: Record<
  string,
  | ContractFormula<
      (ProposalResponse<any> & { voted?: boolean })[],
      { address?: string }
    >
  | undefined
> = {
  // Single choice
  // V1
  'cw-govmod-single': singleChoiceOpenProposals,
  'cw-proposal-single': singleChoiceOpenProposals,
  // V2
  'cwd-proposal-single': singleChoiceOpenProposals,
  'dao-proposal-single': singleChoiceOpenProposals,

  // Multiple choice
  'cwd-proposal-multiple': multipleChoiceOpenProposals,
  'dao-proposal-multiple': multipleChoiceOpenProposals,
}

export const proposalCount: ContractFormula<number | undefined> = {
  compute: async (env) => {
    const proposalModules = await activeProposalModules.compute(env)
    if (!proposalModules) {
      return undefined
    }

    // Get proposal count for each proposal module.
    const proposalCounts = await Promise.all(
      proposalModules.map(async ({ address: proposalModuleAddress, info }) => {
        if (!info) {
          return 0
        }

        const proposalCountFormula =
          PROPOSAL_COUNT_MAP[info.contract.replace('crates.io:', '')]
        const proposalCount = await proposalCountFormula?.compute({
          ...env,
          contractAddress: proposalModuleAddress,
        })

        return proposalCount ?? 0
      })
    )

    // Sum.
    return proposalCounts.reduce((a, b) => a + b)
  },
}

// Map contract name to proposal count formula.
const PROPOSAL_COUNT_MAP: Record<string, ContractFormula<number> | undefined> =
  {
    // Single choice
    // V1
    'cw-govmod-single': singleChoiceProposalCount,
    'cw-proposal-single': singleChoiceProposalCount,
    // V2
    'cwd-proposal-single': singleChoiceProposalCount,
    'dao-proposal-single': singleChoiceProposalCount,

    // Multiple choice
    'cwd-proposal-multiple': multipleChoiceProposalCount,
    'dao-proposal-multiple': multipleChoiceProposalCount,
  }

// Returns contracts with an admin state key set to this DAO. Hopefully these
// are mostly DAO contracts.
export const potentialSubDaos: ContractFormula<
  {
    contractAddress: string
    info: ContractInfo | undefined
  }[]
> = {
  compute: async (env) => {
    const { contractAddress, getTransformationMatches } = env

    const contractsWithAdmin =
      (
        await getTransformationMatches(undefined, 'admin', contractAddress)
      )?.map((match) => match.contractAddress) ?? []

    const infos = await Promise.all(
      contractsWithAdmin.map((contractAddress) =>
        info.compute({
          ...env,
          contractAddress,
        })
      )
    )

    return contractsWithAdmin.map((contractAddress, index) => ({
      contractAddress,
      info: infos[index],
    }))
  },
}

export const allMembers: ContractFormula<
  Record<
    string,
    {
      name: string | undefined
      members: DaoMember[]
    }
  >
> = {
  compute: async (env) => {
    const pendingDaos = new Set([env.contractAddress])
    const daosSeen = new Set(env.contractAddress)

    const _allMembers: Record<
      string,
      {
        name: string | undefined
        members: DaoMember[]
      }
    > = {}

    while (pendingDaos.size > 0) {
      const subDao = pendingDaos.values().next().value
      pendingDaos.delete(subDao)

      // Get config.
      const daoConfig = await config.compute({
        ...env,
        contractAddress: subDao,
      })

      // Get members.
      const members = await listMembers.compute({
        ...env,
        contractAddress: subDao,
      })
      _allMembers[subDao] = {
        name: daoConfig?.name,
        members: members ?? [],
      }

      // Get SubDAOs.
      const subDaos = await listSubDaos.compute({
        ...env,
        contractAddress: subDao,
      })

      // Add to queue if not already added.
      if (subDaos.length > 0) {
        for (const { addr } of subDaos) {
          if (!daosSeen.has(addr)) {
            daosSeen.add(addr)
            pendingDaos.add(addr)
          }
        }
      }
    }

    return _allMembers
  },
}

type DaoMember = {
  address: string
  votingPowerPercent: number
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
    }
  },
}

// Helpers

// V1 proposal module don't have prefixes, so we need to generate them.
const indexToProposalModulePrefix = (index: number) => {
  index += 1
  let prefix = ''
  while (index > 0) {
    const letterIndex = (index - 1) % 26
    // capital A = 65, Z = 90
    prefix = String.fromCharCode(65 + letterIndex) + prefix
    index = ((index - letterIndex) / 26) | 0
  }

  return prefix
}
