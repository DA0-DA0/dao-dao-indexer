import { ContractFormula } from '@/core'

import { config as rebalancerConfig } from './rebalancer'
import { AccountResponse } from './types'

export const admin: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'admin'),
}

export const account: ContractFormula<AccountResponse | undefined> = {
  compute: async (env) => ({
    admin: await admin.compute(env),
    rebalancerConfig: await rebalancerConfig.compute(env),
  }),
}
