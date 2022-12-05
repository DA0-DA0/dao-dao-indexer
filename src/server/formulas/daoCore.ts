import { Formula } from '../types'
import { ContractInfo, info } from './common'
import { balance } from './cw20'

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
  info: ContractInfo
}

interface DumpState {
  // Same as contract query.
  admin: string
  config: Config
  version: ContractInfo
  voting_module: string
  proposal_modules: ProposalModuleWithInfo[]
  // Extra.
  votingModuleInfo: ContractInfo
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

export const config: Formula<Config> = async ({ contractAddress, get }) =>
  (await get(contractAddress, 'config_v2')) ??
  (await get(contractAddress, 'config'))

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
  const modules = await proposalModules(env)
  return modules.filter((module) => module.status === 'Enabled')
}

export const dumpState: Formula<DumpState> = async (env) => {
  const adminResponse = await admin(env)
  const configResponse = await config(env)
  const version = await info(env)
  const votingModuleAddress = await votingModule(env)
  const proposalModulesResponse = await proposalModules(env)

  const votingModuleInfo = await info({
    ...env,
    contractAddress: votingModuleAddress,
  })

  return {
    // Same as contract query.
    admin: adminResponse,
    config: configResponse,
    version,
    voting_module: votingModuleAddress,
    proposal_modules: proposalModulesResponse,
    // Extra.
    votingModuleInfo,
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
  (await config(env)).dao_uri ?? ''
