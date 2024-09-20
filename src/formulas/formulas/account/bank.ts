import { AccountFormula } from '@/types'

export const balance: AccountFormula<string, { denom: string }> = {
  docs: {
    description: 'retrieves the balance of a specific token for this account',
    args: [
      {
        name: 'denom',
        description: 'denomination of the token to retrieve the balance for',
        required: true,
      },
    ],
  },
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
  docs: {
    description: 'retrieves all token balances for this account',
  },
  compute: async ({ address, getBalances }) =>
    (await getBalances(address)) || {},
}
