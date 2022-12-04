import { Formula } from '../types'

type CreationPolicy =
  | {
      Anyone: {}
    }
  | {
      Module: {
        addr: string
      }
    }

export const creationPolicy: Formula = async ({ contractAddress, get }) =>
  await get<CreationPolicy>(contractAddress, 'creation_policy')
