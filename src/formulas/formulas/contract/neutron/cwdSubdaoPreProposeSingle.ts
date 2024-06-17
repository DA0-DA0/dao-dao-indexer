import { ContractFormula } from '@/core/types'

export * from '../prePropose/daoPreProposeBase'

export const timelockAddress: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'timelock_contract_address'),
}
