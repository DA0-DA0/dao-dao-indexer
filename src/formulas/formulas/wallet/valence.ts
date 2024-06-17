import { WalletFormula } from '../../types'

export const accounts: WalletFormula<string[]> = {
  compute: async (env) => {
    const { walletAddress, getTransformationMatches, getCodeIdsForKeys } = env

    const codeIds = getCodeIdsForKeys('valence-account')
    if (!codeIds.length) {
      throw new Error('missing valence account code IDs')
    }

    const valenceAccounts =
      (await getTransformationMatches(
        undefined,
        `admin:${walletAddress}`,
        undefined,
        codeIds
      )) ?? []

    return valenceAccounts.map(({ contractAddress }) => contractAddress)
  },
}
