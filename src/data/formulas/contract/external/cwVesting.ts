import { ContractFormula, dbKeyToKeys } from '@/core'

type Validator = {
  validator: string
  timeMs: number
  amount: string
}

export const info: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'vesting'),
}

export const validators: ContractFormula<Validator[]> = {
  compute: async ({ contractAddress, getMap }) => {
    const validatorsMap =
      (await getMap(contractAddress, 'validator', {
        keyType: 'raw',
      })) ?? {}

    const validators = Object.entries(validatorsMap)
      .map(([key, amount]): Validator => {
        const [validator, epoch] = dbKeyToKeys(key, [false, true]) as [
          string,
          number
        ]

        return {
          validator,
          timeMs: epoch * 1000,
          amount,
        }
      })
      // Sort ascending by time.
      .sort((a, b) => a.timeMs - b.timeMs)

    return validators
  },
}
