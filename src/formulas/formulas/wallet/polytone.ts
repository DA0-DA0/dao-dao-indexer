import { WalletFormula } from '@/types'

// Map polytone note contract to the proxy contract for this account.
export const proxies: WalletFormula<Record<string, string>> = {
  compute: async ({ walletAddress, getTransformationMatches }) => {
    const notesWithRemoteAddress =
      (await getTransformationMatches(
        undefined,
        `remoteAddress:${walletAddress}`
      )) ?? []

    return notesWithRemoteAddress.reduce(
      (acc, { contractAddress, value }) => ({
        ...acc,
        [contractAddress]: value as string,
      }),
      {} as Record<string, string>
    )
  },
}
