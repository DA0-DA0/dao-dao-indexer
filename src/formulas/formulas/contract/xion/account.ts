import { Authenticator } from './types/Account.types'
import { ContractFormula } from '@/types'

const AccountStorageKeys = {
  AUTHENTICATORS: 'authenticators',
}

export const authenticators: ContractFormula<Map<number, Authenticator>> = {
  docs: {
    description: 'Get authenticator map for account',
  },
  compute: async (env) => {
    const { contractAddress, getMap } = env

    const authenticatorMap = (await getMap<number, Authenticator>(
      contractAddress,
      AccountStorageKeys.AUTHENTICATORS,
      {
        keyType: 'number',
      },
    )) ?? {}

    let responseMap = new Map<number, Authenticator>

    Object.entries(authenticatorMap)
      .map(([index, authenticator]) => {
          responseMap.set(index, authenticator)
        },
      )

    return responseMap
  },
}