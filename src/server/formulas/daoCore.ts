import { Formula } from '../types'
import { ContractInfo, info } from './common'
import { balance } from './cw20'

interface Config {
  automaticallyAddCw20s: boolean
  automaticallyAddCw721s: boolean
  daoUri?: string | null
  description: string
  imageUrl?: string | null
  name: string
}

interface ProposalModule {
  address: string
  prefix: string
  status: 'Enabled' | 'Disabled'
}

interface ProposalModuleWithInfo extends ProposalModule {
  info: ContractInfo
}

interface DumpState {
  admin: string
  config: Config
  version: ContractInfo
  votingModule: {
    address: string
    info: ContractInfo
  }
  proposalModules: ProposalModuleWithInfo[]
  activeProposalModuleCount: number
  totalProposalModuleCount: number
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
  balance: string
}

interface SubDao {
  addr: string
  charter?: string | null
}

export const config: Formula<Config> = async ({ contractAddress, get }) => {
  const config =
    (await get(contractAddress, 'config_v2')) ??
    (await get(contractAddress, 'config'))

  return {
    automaticallyAddCw20s: config.automatically_add_cw20s,
    automaticallyAddCw721s: config.automatically_add_cw721s,
    daoUri: config.dao_uri,
    description: config.description,
    imageUrl: config.image_url,
    name: config.name,
  }
}

export const proposalModules: Formula<ProposalModuleWithInfo[]> = async (
  env
) => {
  const { contractAddress, get } = env

  const proposalModules: ProposalModule[] = []

  // V2.
  const proposalModuleMap = await get<Record<string, ProposalModule>>(
    contractAddress,
    'proposal_modules_v2'
  )

  if (proposalModuleMap) {
    proposalModules.push(...Object.values(proposalModuleMap))
  }
  // V1.
  else {
    const proposalModuleAddresses = Object.keys(
      await get<Record<string, unknown>>(contractAddress, 'proposal_modules')
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
      const contractInfo = await info(env)

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
  const modules = await proposalModules(env)
  return modules.filter((module) => module.status === 'Enabled')
}

export const dumpState: Formula<DumpState> = async (env) => {
  const { contractAddress, get } = env

  const adminResponse = await admin(env)
  const configResponse = await config(env)
  const version = await info(env)
  const votingModuleAddress = await votingModule(env)
  const votingModuleInfo = await info({
    ...env,
    contractAddress: votingModuleAddress,
  })
  const proposalModulesResponse = await proposalModules(env)
  const activeProposalModuleCount = await get<number>(
    contractAddress,
    'active_proposal_module_count'
  )
  const totalProposalModuleCount = await get<number>(
    contractAddress,
    'total_proposal_module_count'
  )

  return {
    admin: adminResponse,
    config: configResponse,
    version,
    votingModule: {
      address: votingModuleAddress,
      info: votingModuleInfo,
    },
    proposalModules: proposalModulesResponse,
    activeProposalModuleCount,
    totalProposalModuleCount,
  }
}

export const paused: Formula<Expiration | false> = async ({
  contractAddress,
  get,
}) => (await get<Expiration | undefined>(contractAddress, 'paused')) ?? false

export const admin: Formula<string> = async ({ contractAddress, get }) =>
  await get<string>(contractAddress, 'admin')

export const adminNomination: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get<string>(contractAddress, 'nominated_admin')

export const votingModule: Formula<string> = async ({ contractAddress, get }) =>
  await get<string>(contractAddress, 'voting_module')

export const item: Formula<string | false> = async ({
  contractAddress,
  get,
  args: { key },
}) => await get<Record<string, string>>(contractAddress, 'items')?.[key]

export const listItems: Formula<string[]> = async ({ contractAddress, get }) =>
  Object.keys(
    (await get<Record<string, string>>(contractAddress, 'items')) ?? {}
  )

export const cw20List: Formula<string[]> = async ({ contractAddress, get }) =>
  Object.keys((await get<Record<string, any>>(contractAddress, 'cw20s')) ?? {})

export const cw721List: Formula<string[]> = async ({ contractAddress, get }) =>
  Object.keys((await get<Record<string, any>>(contractAddress, 'cw721s')) ?? {})

export const cw20Balances: Formula<Cw20Balance[]> = async (env) => {
  const cw20Addresses = await cw20List(env)

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
  get,
}) => {
  // V2. V1 doesn't have sub DAOs, so use empty map.
  const subDaoMap =
    (await get<Record<string, string | undefined>>(
      contractAddress,
      'sub_daos'
    )) ?? {}

  return Object.entries(subDaoMap).map(([addr, charter]) => ({
    addr,
    charter,
  }))
}

export const daoUri: Formula<string> = async (env) =>
  (await config(env)).daoUri ?? ''
