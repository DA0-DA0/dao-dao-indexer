import { ContractFormula } from '@/types'

import { Authenticator } from './types/Account.types'

const AccountStorageKeys = {
  AUTHENTICATORS: 'authenticators',
}

export const authenticators: ContractFormula<Authenticator[]> = {
  docs: {
    description: 'Get authenticator map for account',
  },
  compute: async (env) => {
    const { contractAddress, getMap } = env

    const authenticatorMap =
      (await getMap<number, Authenticator>(
        contractAddress,
        AccountStorageKeys.AUTHENTICATORS
      )) ?? {}

    return Object.values(authenticatorMap)
  },
}
