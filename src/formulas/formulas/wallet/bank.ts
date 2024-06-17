import { WalletFormula } from '@/types'

export const balance: WalletFormula<string | undefined, { denom: string }> = {
  compute: async ({ walletAddress, getBalance, args: { denom } }) => {
    if (!denom) {
      throw new Error('missing `denom`')
    }

    return await getBalance(walletAddress, denom)
  },
}

export const balances: WalletFormula<Record<string, string>> = {
  compute: async ({ walletAddress, getBalances }) =>
    (await getBalances(walletAddress)) || {},
}
