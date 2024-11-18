import { AccountFormula } from '@/types'

// Map polytone note contract to the proxy contract for this account.
export const proxies: AccountFormula<Record<string, string>> = {
  docs: {
    description:
      'retrieves mapping of polytone note contract to the remote address controlled by this account on the chain the note is connected to',
  },
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
