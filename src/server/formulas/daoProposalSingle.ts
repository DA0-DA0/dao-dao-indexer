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

export const creationPolicy: Formula<CreationPolicy> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'creation_policy')
