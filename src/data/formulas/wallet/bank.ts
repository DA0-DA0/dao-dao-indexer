import { WalletFormula } from '@/core'

export const balance: WalletFormula<string | undefined, { denom: string }> = {
  compute: async ({ walletAddress, getBalance, args: { denom } }) => {
    if (!denom) {
      throw new Error('missing `denom`')
    }

    return (await getBalance(walletAddress, denom))?.toString()
  },
}

export const balances: WalletFormula<Record<string, string>> = {
  compute: async ({ walletAddress, getBalances }) =>
    Object.entries((await getBalances(walletAddress)) || {}).reduce(
      (acc, [denom, balance]) => ({
        ...acc,
        [denom]: balance.toString(),
      }),
      {} as Record<string, string>
    ),
}
