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

export const config: Formula = async ({ contractAddress, get }) => {
  const config = await get<Config>(contractAddress, 'config_v2')
  return {
    ...config,
    image_url: undefined,
    imageUrl: config.image_url,
  }
}

export const activeProposalModules: Formula = async ({
  contractAddress,
  get,
}) => {
  const proposalModuleMap = await get<Record<string, ProposalModule>>(
    contractAddress,
    'proposal_modules_v2'
  )
  const activeProposalModules = Object.values(proposalModuleMap).filter(
    ({ status }) => status === 'Enabled'
  )

  return await Promise.all(
    activeProposalModules.map(async (data) => {
      const contractInfo = await info({ contractAddress: data.address, get })

      return {
        ...data,
        info: contractInfo,
      }
    })
  )
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
  const proposalModuleMap = await get<Record<string, ProposalModule>>(
    contractAddress,
    'proposal_modules_v2'
  )
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
    proposalModules: Object.values(proposalModuleMap),
    activeProposalModuleCount,
    totalProposalModuleCount,
  }
}
