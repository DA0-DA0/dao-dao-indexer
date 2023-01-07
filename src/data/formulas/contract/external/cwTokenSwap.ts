import { ContractFormula } from '@/core'

export const status: ContractFormula = {
  compute: async ({ contractAddress, get, prefetch }) => {
    await prefetch(contractAddress, 'counterparty_one', 'counterparty_two')

    const counterparty_one = await get(contractAddress, 'counterparty_one')
    const counterparty_two = await get(contractAddress, 'counterparty_two')

    return counterparty_one && counterparty_two
      ? {
          counterparty_one,
          counterparty_two,
        }
      : undefined
  },
}
