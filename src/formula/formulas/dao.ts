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

export const info: Formula = async (targetContractAddress, get) =>
  await get<ContractInfo>(targetContractAddress, 'contract_info')

export const config: Formula = async (targetContractAddress, get) =>
  await get<Config>(targetContractAddress, 'config_v2')
