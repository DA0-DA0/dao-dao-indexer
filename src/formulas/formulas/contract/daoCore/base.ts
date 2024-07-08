import { ContractFormula } from '@/types'

import {
  ContractInfo,
  Expiration,
  ProposalModule,
  TotalPowerAtHeight,
  VotingPowerAtHeight,
} from '../../types'
import { isExpirationExpired, makeSimpleContractFormula } from '../../utils'
import { info } from '../common'
import { balance } from '../external/cw20'
import { dao as daoPreProposeBaseDao } from '../prePropose/daoPreProposeBase'
import {
  totalPowerAtHeight as daoVotingCw20StakedTotalPowerAtHeight,
  votingPowerAtHeight as daoVotingCw20StakedVotingPowerAtHeight,
} from '../voting/daoVotingCw20Staked'
import {
  totalPowerAtHeight as daoVotingCw4TotalPowerAtHeight,
  votingPowerAtHeight as daoVotingCw4VotingPowerAtHeight,
} from '../voting/daoVotingCw4'
import {
  totalPowerAtHeight as daoVotingCw721StakedTotalPowerAtHeight,
  votingPowerAtHeight as daoVotingCw721StakedVotingPowerAtHeight,
} from '../voting/daoVotingCw721Staked'
import {
  totalPowerAtHeight as daoVotingNativeStakedTotalPowerAtHeight,
  votingPowerAtHeight as daoVotingNativeStakedVotingPowerAtHeight,
} from '../voting/daoVotingNativeStaked'
import {
  totalPowerAtHeight as daoVotingOnftStakedTotalPowerAtHeight,
  votingPowerAtHeight as daoVotingOnftStakedVotingPowerAtHeight,
} from '../voting/daoVotingOnftStaked'
import {
  totalPowerAtHeight as daoVotingTokenStakedTotalPowerAtHeight,
  votingPowerAtHeight as daoVotingTokenStakedVotingPowerAtHeight,
} from '../voting/daoVotingTokenStaked'

export type Config = {
  automatically_add_cw20s: boolean
  automatically_add_cw721s: boolean
  dao_uri?: string | null
  description: string
  image_url?: string | null
  name: string
}

export type ProposalModuleWithInfo = ProposalModule & {
  info?: ContractInfo
}

export type PauseInfoResponse =
  | {
      paused: {
        expiration: Expiration
      }
    }
  | {
      unpaused: {}
    }

export type Cw20Balance = {
  addr: string
  balance?: string
}

export type SubDao = {
  addr: string
  charter?: string | null
}

export const config = makeSimpleContractFormula<Config>({
  transformation: 'config',
  fallbackKeys: ['config_v2', 'config'],
})

export const proposalModules: ContractFormula<ProposalModuleWithInfo[]> = {
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
      throw new Error('failed to load proposal modules')
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

export const activeProposalModules: ContractFormula<ProposalModuleWithInfo[]> =
  {
    compute: async (env) => {
      const modules = await proposalModules.compute(env)
      return modules.filter(
        (module) => module.status === 'enabled' || module.status === 'Enabled'
      )
    },
  }

export const pauseInfo: ContractFormula<PauseInfoResponse> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const { contractAddress, getTransformationMatch, get } = env

    const expiration =
      (await getTransformationMatch<Expiration>(contractAddress, 'paused'))
        ?.value ??
      // Fallback to events.
      (await get<Expiration>(contractAddress, 'paused'))

    return !expiration || isExpirationExpired(env, expiration)
      ? { unpaused: {} }
      : { paused: { expiration } }
  },
}

// Backwards compatibility.
export const paused = pauseInfo

export const admin: ContractFormula<string | null> = {
  compute: async ({ contractAddress, getTransformationMatch, get }) => {
    return (
      (await getTransformationMatch<string>(contractAddress, 'admin'))?.value ??
      // Fallback to events.
      (await get<string>(contractAddress, 'admin')) ??
      // Fallback to Neutron SubDAO config main_dao field.
      (await get<any>(contractAddress, 'config_v2'))?.main_dao ??
      // Null if nothing found because no admin set.
      null
    )
  },
}

export const adminNomination: ContractFormula<string | null> = {
  compute: async ({ contractAddress, getTransformationMatch, get }) =>
    (await getTransformationMatch<string>(contractAddress, 'nominatedAdmin'))
      ?.value ??
    // Fallback to events.
    (await get<string>(contractAddress, 'nominated_admin')) ??
    // Null if nothing found because no admin nominated.
    null,
}

export const votingModule: ContractFormula<string> = {
  compute: async ({ contractAddress, getTransformationMatch, get }) => {
    const votingModule =
      (await getTransformationMatch<string>(contractAddress, 'votingModule'))
        ?.value ??
      // Fallback to events.
      (await get<string>(contractAddress, 'voting_module'))

    if (!votingModule) {
      throw new Error('failed to load voting module')
    }

    return votingModule
  },
}

export const item: ContractFormula<string | null, { key: string }> = {
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
      (await getTransformationMatch<string>(contractAddress, `item:${key}`))
        ?.value ??
      // Fallback to events.
      (await get<string>(contractAddress, 'items', key)) ??
      // Null if nothing found because no item set.
      null
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
      (await getTransformationMap<string, string | null>(
        contractAddress,
        'subDao'
      )) ??
      // Fallback to events.
      (await getMap<string, string | null>(contractAddress, 'sub_daos')) ??
      {}

    return Object.entries(subDaoMap).map(([addr, charter]) => ({
      addr,
      charter,
    }))
  },
}

export const daoUri: ContractFormula<{ dao_uri: string | null }> = {
  compute: async (env) => ({
    dao_uri: (await config.compute(env)).dao_uri ?? null,
  }),
}

const VOTING_POWER_AT_HEIGHT_FORMULAS: ContractFormula<
  VotingPowerAtHeight,
  { address: string }
>[] = [
  daoVotingCw4VotingPowerAtHeight,
  daoVotingCw20StakedVotingPowerAtHeight,
  daoVotingCw721StakedVotingPowerAtHeight,
  daoVotingNativeStakedVotingPowerAtHeight,
  daoVotingTokenStakedVotingPowerAtHeight,
  daoVotingOnftStakedVotingPowerAtHeight,
]

export const votingPowerAtHeight: ContractFormula<
  VotingPowerAtHeight,
  { address: string }
> = {
  compute: async (env) => {
    const votingModuleAddress = (await votingModule.compute(env)) ?? ''
    if (!votingModuleAddress) {
      throw new Error('missing `votingModuleAddress`')
    }

    const codeIdKey = await env.getCodeIdKeyForContract(votingModuleAddress)
    // Unrecognized contract.
    if (!codeIdKey) {
      throw new Error('unrecognized voting module')
    }

    // Find formula matching code ID key.
    const votingPowerAtHeightFormula = VOTING_POWER_AT_HEIGHT_FORMULAS.find(
      (formula) => formula.filter?.codeIdsKeys?.includes(codeIdKey)
    )
    if (!votingPowerAtHeightFormula) {
      throw new Error(`no voting module passthrough found for ${codeIdKey}`)
    }

    return await votingPowerAtHeightFormula.compute({
      ...env,
      contractAddress: votingModuleAddress,
    })
  },
}

export const votingPower: ContractFormula<string, { address: string }> = {
  compute: async (env) => (await votingPowerAtHeight.compute(env)).power,
}

const TOTAL_POWER_AT_HEIGHT_FORMULAS: ContractFormula<TotalPowerAtHeight>[] = [
  daoVotingCw4TotalPowerAtHeight,
  daoVotingCw20StakedTotalPowerAtHeight,
  daoVotingCw721StakedTotalPowerAtHeight,
  daoVotingNativeStakedTotalPowerAtHeight,
  daoVotingTokenStakedTotalPowerAtHeight,
  daoVotingOnftStakedTotalPowerAtHeight,
]

export const totalPowerAtHeight: ContractFormula<TotalPowerAtHeight> = {
  compute: async (env) => {
    const votingModuleAddress = (await votingModule.compute(env)) ?? ''
    if (!votingModuleAddress) {
      throw new Error('missing `votingModuleAddress`')
    }

    const codeIdKey = await env.getCodeIdKeyForContract(votingModuleAddress)
    // Unrecognized contract.
    if (!codeIdKey) {
      throw new Error('unrecognized voting module')
    }

    // Find formula matching code ID key.
    const totalPowerAtHeightFormula = TOTAL_POWER_AT_HEIGHT_FORMULAS.find(
      (formula) => formula.filter?.codeIdsKeys?.includes(codeIdKey)
    )
    if (!totalPowerAtHeightFormula) {
      throw new Error(`no voting module passthrough found for ${codeIdKey}`)
    }

    return await totalPowerAtHeightFormula.compute({
      ...env,
      contractAddress: votingModuleAddress,
    })
  },
}

export const totalPower: ContractFormula<string, { address: string }> = {
  compute: async (env) => (await totalPowerAtHeight.compute(env)).power,
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

// Map polytone note contract to the proxy contract for this DAO.
export const polytoneProxies: ContractFormula<Record<string, string>> = {
  compute: async (env) => {
    const { contractAddress, getTransformationMatches } = env
    const notesWithRemoteAddress =
      (await getTransformationMatches(
        undefined,
        `remoteAddress:${contractAddress}`
      )) ?? []

    return notesWithRemoteAddress.reduce(
      (acc, { contractAddress, value }) => ({
        ...acc,
        [contractAddress]: value as string,
      }),
      {} as Record<string, string>
    )
  },
}

type ApprovalDao = {
  dao: string
  preProposeAddress: string
}

// Get all DAOs with dao-pre-propose-approval-single contracts that have this
// DAO set as the approver.
export const approvalDaos: ContractFormula<ApprovalDao[]> = {
  compute: async (env) => {
    const { contractAddress, getTransformationMatches, getCodeIdsForKeys } = env

    const codeIds = getCodeIdsForKeys('dao-pre-propose-approval-single')
    if (!codeIds.length) {
      throw new Error('missing dao-pre-propose-approval-single code IDs')
    }

    const daoPreProposeApprovalSingleContracts =
      (await getTransformationMatches(
        undefined,
        `approver:${contractAddress}`,
        true,
        codeIds
      )) ?? []

    const daos = await Promise.all(
      daoPreProposeApprovalSingleContracts.map(({ contractAddress }) =>
        daoPreProposeBaseDao.compute({
          ...env,
          contractAddress,
        })
      )
    )

    return daos.flatMap((dao, index): ApprovalDao | [] =>
      dao
        ? {
            dao,
            preProposeAddress:
              daoPreProposeApprovalSingleContracts[index].contractAddress,
          }
        : []
    )
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
