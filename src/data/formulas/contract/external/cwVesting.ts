import { ContractFormula, dbKeyToKeys } from '@/core'

type ValidatorStake = {
  validator: string
  timeMs: number
  // Staked + unstaking
  amount: string
}

export const info: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'vesting'),
}

// The amount staked and unstaking for each validator over time.
export const validatorStakes: ContractFormula<ValidatorStake[]> = {
  compute: async ({ contractAddress, getMap }) => {
    const validatorsMap =
      (await getMap(contractAddress, 'validator', {
        keyType: 'raw',
      })) ?? {}

    const validators = Object.entries(validatorsMap)
      .map(([key, amount]): ValidatorStake => {
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
      // Sort descending by time.
      .sort((a, b) => b.timeMs - a.timeMs)

    return validators
  },
}
