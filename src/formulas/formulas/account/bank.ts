import { AccountFormula } from '@/types'

export const balance: AccountFormula<string, { denom: string }> = {
  compute: async ({ address, getBalance, args: { denom } }) => {
    if (!denom) {
      throw new Error('missing `denom`')
    }

    const balance = await getBalance(address, denom)

    if (!balance) {
      throw new Error('missing balance')
    }

    return balance
  },
}

export const balances: AccountFormula<Record<string, string>> = {
  compute: async ({ address, getBalances }) =>
    (await getBalances(address)) || {},
}
