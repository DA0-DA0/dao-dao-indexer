import { Formula } from '../types'
import { ContractInfo, info, instantiatedAt } from './common'
import { balance } from './cw20'
import {
  totalPower as daoVotingCw20StakedTotalPower,
  votingPower as daoVotingCw20StakedVotingPower,
} from './voting/daoVotingCw20Staked'
import {
  totalPower as daoVotingCw4TotalPower,
  votingPower as daoVotingCw4VotingPower,
} from './voting/daoVotingCw4'

interface Config {
  automatically_add_cw20s: boolean
  automatically_add_cw721s: boolean
  dao_uri?: string | null
  description: string
  image_url?: string | null
  name: string
}

interface ProposalModule {
  address: string
  prefix: string
  status: 'Enabled' | 'Disabled'
}

interface ProposalModuleWithInfo extends ProposalModule {
  info?: ContractInfo
}

interface DumpState {
  // Same as contract query.
  admin?: string
  config?: Config
  version?: ContractInfo
  voting_module?: string
  proposal_modules?: ProposalModuleWithInfo[]
  // Extra.
  votingModuleInfo?: ContractInfo
  createdAt?: string
}

type Expiration =
  | {
      at_height: number
    }
  | {
      at_time: string
    }
  | {
      never: {}
    }

interface Cw20Balance {
  addr: string
  balance?: string
}

interface SubDao {
  addr: string
  charter?: string | null
}

export const config: Formula<Config | undefined> = async ({
  contractAddress,
  get,
}) =>
  (await get(contractAddress, 'config_v2')) ??
  (await get(contractAddress, 'config'))

export const proposalModules: Formula<ProposalModuleWithInfo[]> = async (
  env
) => {
  const { contractAddress, getMap } = env

  const proposalModules: ProposalModule[] = []

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
      (await getMap<string, string>(contractAddress, 'proposal_modules')) ?? {}
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

  return await Promise.all(
    proposalModules.map(async (data): Promise<ProposalModuleWithInfo> => {
      const contractInfo = await info({
        ...env,
        contractAddress: data.address,
      })

      return {
        ...data,
        info: contractInfo,
      }
    })
  )
}

export const activeProposalModules: Formula<ProposalModuleWithInfo[]> = async (
  env
) => {
  const modules = (await proposalModules(env)) ?? []
  return modules.filter((module) => module.status === 'Enabled')
}

export const dumpState: Formula<DumpState> = async (env) => {
  const [
    adminResponse,
    configResponse,
    version,
    { address: voting_module, info: votingModuleInfo },
    proposal_modules,
    createdAt,
  ] = await Promise.all([
    admin(env),
    config(env),
    info(env),
    votingModule(env).then(async (contractAddress) => {
      const infoResponse = await info({
        ...env,
        contractAddress: contractAddress ?? '',
      })
      return {
        address: contractAddress,
        info: infoResponse,
      }
    }),
    proposalModules(env),
    instantiatedAt(env),
  ])

  return {
    // Same as contract query.
    admin: adminResponse,
    config: configResponse,
    version,
    voting_module,
    proposal_modules,
    // Extra.
    votingModuleInfo,
    createdAt,
  }
}

export const paused: Formula<Expiration | false> = async ({
  contractAddress,
  get,
}) => (await get<Expiration | undefined>(contractAddress, 'paused')) ?? false

export const admin: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get<string>(contractAddress, 'admin')

export const adminNomination: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get<string>(contractAddress, 'nominated_admin')

export const votingModule: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get<string>(contractAddress, 'voting_module')

export const item: Formula<string | undefined, { key: string }> = async ({
  contractAddress,
  get,
  args: { key },
}) => await get<string | undefined>(contractAddress, 'items', key)

export const listItems: Formula<string[]> = async ({
  contractAddress,
  getMap,
}) =>
  Object.keys((await getMap<string, string>(contractAddress, 'items')) ?? {})

export const cw20List: Formula<string[]> = async ({
  contractAddress,
  getMap,
}) =>
  Object.keys((await getMap<string, string>(contractAddress, 'cw20s')) ?? {})

export const cw721List: Formula<string[]> = async ({
  contractAddress,
  getMap,
}) =>
  Object.keys((await getMap<string, string>(contractAddress, 'cw721s')) ?? {})

export const cw20Balances: Formula<Cw20Balance[]> = async (env) => {
  const cw20Addresses = (await cw20List(env)) ?? []

  return await Promise.all(
    cw20Addresses.map(async (addr): Promise<Cw20Balance> => {
      const balanceResponse = await balance({
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
}

export const listSubDaos: Formula<SubDao[]> = async ({
  contractAddress,
  getMap,
}) => {
  // V2. V1 doesn't have sub DAOs; use empty map if undefined.
  const subDaoMap =
    (await getMap<string, string | undefined>(contractAddress, 'sub_daos')) ??
    {}

  return Object.entries(subDaoMap).map(([addr, charter]) => ({
    addr,
    charter,
  }))
}

export const daoUri: Formula<string> = async (env) =>
  (await config(env))?.dao_uri ?? ''

export const votingPower: Formula<string, { address: string }> = async (
  env
) => {
  const votingModuleAddress = (await votingModule(env)) ?? ''
  const votingModuleInfo = await info({
    ...env,
    contractAddress: votingModuleAddress,
  })

  const votingPowerFormula =
    votingModuleInfo &&
    VOTING_POWER_MAP[votingModuleInfo.contract.replace('crates.io:', '')]
  if (!votingPowerFormula) {
    throw new Error(`Unexpected voting module: ${votingModuleInfo?.contract}`)
  }
  return await votingPowerFormula({
    ...env,
    contractAddress: votingModuleAddress,
  })
}

export const totalPower: Formula<string> = async (env) => {
  const votingModuleAddress = (await votingModule(env)) ?? ''
  const votingModuleInfo = await info({
    ...env,
    contractAddress: votingModuleAddress,
  })

  const totalPowerFormula =
    votingModuleInfo &&
    TOTAL_POWER_MAP[votingModuleInfo.contract.replace('crates.io:', '')]
  if (!totalPowerFormula) {
    throw new Error(`Unexpected voting module: ${votingModuleInfo?.contract}`)
  }
  return await totalPowerFormula({
    ...env,
    contractAddress: votingModuleAddress,
  })
}

// Map contract name to voting power formula.
const VOTING_POWER_MAP: Record<
  string,
  Formula<string, { address: string }> | undefined
> = {
  'cw4-voting': daoVotingCw4VotingPower,
  'cwd-voting-cw4': daoVotingCw4VotingPower,
  'dao-voting-cw4': daoVotingCw4VotingPower,
  'cw20-staked-balance-voting': daoVotingCw20StakedVotingPower,
  'cwd-voting-cw20-staked': daoVotingCw20StakedVotingPower,
  'dao-voting-cw20-staked': daoVotingCw20StakedVotingPower,
}

// Map contract name to total power formula.
const TOTAL_POWER_MAP: Record<string, Formula<string> | undefined> = {
  'cw4-voting': daoVotingCw4TotalPower,
  'cwd-voting-cw4': daoVotingCw4TotalPower,
  'dao-voting-cw4': daoVotingCw4TotalPower,
  'cw20-staked-balance-voting': daoVotingCw20StakedTotalPower,
  'cwd-voting-cw20-staked': daoVotingCw20StakedTotalPower,
  'dao-voting-cw20-staked': daoVotingCw20StakedTotalPower,
}
