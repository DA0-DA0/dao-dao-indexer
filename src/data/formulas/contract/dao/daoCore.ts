import { ContractFormula } from '@/core'

import { ContractInfo, Expiration, ProposalModule } from '../../../types'
import { isExpirationExpired } from '../../utils'
import { info, instantiatedAt } from '../common'
import { balance } from '../external/cw20'
import { openProposals as multipleChoiceOpenProposals } from '../proposal/daoProposalMultiple'
import { openProposals as singleChoiceOpenProposals } from '../proposal/daoProposalSingle'
import { ProposalResponse } from '../proposal/types'
import {
  totalPower as daoVotingCw20StakedTotalPower,
  votingPower as daoVotingCw20StakedVotingPower,
} from '../voting/daoVotingCw20Staked'
import {
  totalPower as daoVotingCw4TotalPower,
  votingPower as daoVotingCw4VotingPower,
} from '../voting/daoVotingCw4'

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
  adminConfig?: Config | null
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
  proposals: ProposalResponse<any>[]
}

const CONTRACT_NAMES = ['cw-core', 'cwd-core', 'dao-core']

export const config: ContractFormula<Config | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<Config>(contractAddress, 'config'))?.value,
}

export const proposalModules: ContractFormula<
  ProposalModuleWithInfo[] | undefined
> = {
  compute: async (env) => {
    const { contractAddress, getTransformationMap } = env

    const proposalModules = Object.values(
      (await getTransformationMap<string, ProposalModule>(
        contractAddress,
        'proposalModules'
      )) ?? {}
    )

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
        name: 'proposalModules',
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
      env.getTransformationMatch<number | undefined>(
        env.contractAddress,
        'activeProposalModuleCount'
      ),
      env.getTransformationMatch<number | undefined>(
        env.contractAddress,
        'totalProposalModuleCount'
      ),
      // Extra.
      instantiatedAt.compute(env),
    ])

    // If no config, this must not be a DAO core contract.
    if (!configResponse) {
      return undefined
    }

    // Check if admin is a DAO core contract that is not this one, and load config
    // if so.
    let adminConfig: Config | undefined | null = null
    const adminInfo =
      adminResponse && adminResponse !== env.contractAddress
        ? await info.compute({
            ...env,
            contractAddress: adminResponse,
          })
        : undefined
    if (
      adminResponse &&
      adminInfo &&
      CONTRACT_NAMES.some((name) => adminInfo.contract.includes(name))
    ) {
      adminConfig = await config.compute({
        ...env,
        contractAddress: adminResponse,
      })
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
        activeProposalModuleCount?.value ?? proposal_modules?.length ?? 0,
      total_proposal_module_count:
        totalProposalModuleCount?.value ?? proposal_modules?.length ?? 0,
      // Extra.
      votingModuleInfo,
      createdAt,
      adminConfig,
    }
  },
}

export const paused: ContractFormula<PausedResponse> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const { contractAddress, getTransformationMatch } = env

    const expiration = (
      await getTransformationMatch<Expiration>(contractAddress, 'paused')
    )?.value

    return !expiration || isExpirationExpired(env, expiration)
      ? { Unpaused: {} }
      : { Paused: { expiration } }
  },
}

export const admin: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'admin'))?.value,
}

export const adminNomination: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'nominatedAdmin'))
      ?.value,
}

export const votingModule: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'votingModule'))
      ?.value,
}

export const item: ContractFormula<string | undefined, { key: string }> = {
  compute: async ({ contractAddress, get, args: { key } }) => {
    if (!key) {
      throw new Error('missing `key`')
    }

    return await get<string | undefined>(contractAddress, 'items', key)
  },
}

export const listItems: ContractFormula<string[]> = {
  compute: async ({ contractAddress, getMap }) =>
    Object.keys((await getMap<string>(contractAddress, 'items')) ?? {}),
}

export const cw20List: ContractFormula<string[]> = {
  compute: async ({ contractAddress, getMap }) =>
    Object.keys((await getMap<string>(contractAddress, 'cw20s')) ?? {}),
}

export const cw721List: ContractFormula<string[]> = {
  compute: async ({ contractAddress, getMap }) =>
    Object.keys((await getMap<string>(contractAddress, 'cw721s')) ?? {}),
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
  compute: async ({ contractAddress, getMap }) => {
    // V2. V1 doesn't have sub DAOs; use empty map if undefined.
    const subDaoMap =
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
    const votingModuleInfo = await info.compute({
      ...env,
      contractAddress: votingModuleAddress,
    })

    const votingPowerFormula =
      votingModuleInfo &&
      VOTING_POWER_MAP[votingModuleInfo.contract.replace('crates.io:', '')]
    return await votingPowerFormula?.compute({
      ...env,
      contractAddress: votingModuleAddress,
    })
  },
}

export const totalPower: ContractFormula<string | undefined> = {
  compute: async (env) => {
    const votingModuleAddress = (await votingModule.compute(env)) ?? ''
    const votingModuleInfo = await info.compute({
      ...env,
      contractAddress: votingModuleAddress,
    })

    const totalPowerFormula =
      votingModuleInfo &&
      TOTAL_POWER_MAP[votingModuleInfo.contract.replace('crates.io:', '')]
    return await totalPowerFormula?.compute({
      ...env,
      contractAddress: votingModuleAddress,
    })
  },
}

// Map contract name to voting power formula.
const VOTING_POWER_MAP: Record<
  string,
  ContractFormula<string, { address: string }> | undefined
> = {
  'cw4-voting': daoVotingCw4VotingPower,
  'cwd-voting-cw4': daoVotingCw4VotingPower,
  'dao-voting-cw4': daoVotingCw4VotingPower,
  'cw20-staked-balance-voting': daoVotingCw20StakedVotingPower,
  'cwd-voting-cw20-staked': daoVotingCw20StakedVotingPower,
  'dao-voting-cw20-staked': daoVotingCw20StakedVotingPower,
}

// Map contract name to total power formula.
const TOTAL_POWER_MAP: Record<string, ContractFormula<string> | undefined> = {
  'cw4-voting': daoVotingCw4TotalPower,
  'cwd-voting-cw4': daoVotingCw4TotalPower,
  'dao-voting-cw4': daoVotingCw4TotalPower,
  'cw20-staked-balance-voting': daoVotingCw20StakedTotalPower,
  'cwd-voting-cw20-staked': daoVotingCw20StakedTotalPower,
  'dao-voting-cw20-staked': daoVotingCw20StakedTotalPower,
}

// Return open proposals without votes from the given address. If no address
// provided, just return open proposals.
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
  ContractFormula<ProposalResponse<any>[], { address?: string }> | undefined
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
