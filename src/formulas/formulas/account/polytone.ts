import { AccountFormula } from '@/types'

// Map polytone note contract to the proxy contract for this account.
export const proxies: AccountFormula<Record<string, string>> = {
  compute: async ({ address: walletAddress, getTransformationMatches }) => {
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
