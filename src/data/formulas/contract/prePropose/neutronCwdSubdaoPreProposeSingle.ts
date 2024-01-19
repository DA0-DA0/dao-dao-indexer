import { ContractFormula } from '@/core'

export const timelockAddress: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'timelock_contract_address'),
}
