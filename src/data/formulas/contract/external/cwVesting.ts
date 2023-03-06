import { ContractFormula } from '@/core'

export const info: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'vesting_payment'),
}

export const validators: ContractFormula = {
  dynamic: true,
  compute: async ({ contractAddress, getMap }) => {
    const validators = await getMap(contractAddress, 'validator')
    return validators
  },
}
