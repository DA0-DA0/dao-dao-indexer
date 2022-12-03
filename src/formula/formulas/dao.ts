import { Formula } from '../types'

interface ContractInfo {
  contract: string
  version: string
}

interface Config {
  name: string
  description: string
  image_url: string
}

interface ProposalModule {
  address: string
  prefix: string
  status: 'Enabled' | 'Disabled'
}

export const info: Formula = async ({ contractAddress, get }) =>
  await get<ContractInfo>(contractAddress, 'contract_info')

export const config: Formula = async ({ contractAddress, get }) => {
  const config = await get<Config>(contractAddress, 'config_v2')
  return {
    ...config,
    image_url: undefined,
    imageUrl: config.image_url,
  }
}

export const dumpState: Formula = async ({ contractAddress, get }) => {
  const admin = await get<string>(contractAddress, 'admin')
  const config = await get<Config>(contractAddress, 'config_v2')
  const version = await get<ContractInfo>(contractAddress, 'contract_info')
  const votingModule = await get<string>(contractAddress, 'voting_module')
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
    config,
    version,
    votingModule,
    proposalModules: Object.values(proposalModuleMap),
    activeProposalModuleCount,
    totalProposalModuleCount,
  }
}
