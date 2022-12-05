import { Formula } from '../types'
import { ContractInfo, info } from './common'

interface Config {
  name: string
  description: string
  image_url: string
}

interface ProposalModule {
  address: string
  prefix: string
  status: 'Enabled' | 'Disabled'
  info?: ContractInfo
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

export const config: Formula = async ({ contractAddress, get }) => {
  const config =
    (await get<Config>(contractAddress, 'config_v2')) ??
    (await get<Config>(contractAddress, 'config'))
  return {
    ...config,
    image_url: undefined,
    imageUrl: config.image_url,
  }
}

export const proposalModules: Formula = async ({ contractAddress, get }) => {
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
    proposalModules.map(async (data) => {
      const contractInfo = await info({ contractAddress: data.address, get })

      return {
        ...data,
        info: contractInfo,
      }
    })
  )
}

export const activeProposalModules: Formula = async (env) => {
  const modules = await proposalModules(env)
  return modules.filter((module) => module.status === 'Enabled')
}

export const dumpState: Formula = async ({ contractAddress, get }) => {
  const admin = await get<string>(contractAddress, 'admin')
  const configResponse = await config({ contractAddress, get })
  const version = await info({ contractAddress, get })
  const votingModuleAddress = await get<string>(
    contractAddress,
    'voting_module'
  )
  const votingModuleInfo = await info({
    contractAddress: votingModuleAddress,
    get,
  })
  const proposalModulesResponse = await proposalModules({
    contractAddress,
    get,
  })
  const activeProposalModuleCount = await get<number>(
    contractAddress,
    'active_proposal_module_count'
  )
  const totalProposalModuleCount = await get<number>(
    contractAddress,
    'total_proposal_module_count'
  )

  return {
    admin,
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

export const paused: Formula = async ({ contractAddress, get }) =>
  await get<Expiration>(contractAddress, 'paused')
