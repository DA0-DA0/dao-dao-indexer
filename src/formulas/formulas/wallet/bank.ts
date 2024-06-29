import { WalletFormula } from '@/types'

export const balance: WalletFormula<string, { denom: string }> = {
  compute: async ({ walletAddress, getBalance, args: { denom } }) => {
    if (!denom) {
      throw new Error('missing `denom`')
    }

    const balance = await getBalance(walletAddress, denom)

    if (!balance) {
      throw new Error('missing balance')
    }

    return balance
  },
}

export const balances: WalletFormula<Record<string, string>> = {
  compute: async ({ walletAddress, getBalances }) =>
    (await getBalances(walletAddress)) || {},
}
