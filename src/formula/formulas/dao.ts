import { Formula } from '../types'

interface DaoInfo {
  name: string
  description: string
  imageUrl: string
}

export const daoInfo: Formula = async (targetContractAddress, get) => {
  const config = await get<{
    name: string
    description: string
    image_url: string
  }>(targetContractAddress, 'config_v2')

  if (!config) {
    return undefined
  }

  return {
    name: config.name,
    description: config.description,
    imageUrl: config.image_url,
  } as DaoInfo
}

export const contractInfo: Formula = async (targetContractAddress, get) => {
  return await get<{
    name: string
    description: string
    image_url: string
  }>(targetContractAddress, 'contract_info')
}
