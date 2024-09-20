import { AccountFormula } from '@/types'

export const accounts: AccountFormula<string[]> = {
  compute: async (env) => {
    const { address, getTransformationMatches, getCodeIdsForKeys } = env

    const codeIds = getCodeIdsForKeys('valence-account')
    if (!codeIds.length) {
      throw new Error('missing valence account code IDs')
    }

    const valenceAccounts =
      (await getTransformationMatches(
        undefined,
        `admin:${address}`,
        undefined,
        codeIds
      )) ?? []

    return valenceAccounts.map(({ contractAddress }) => contractAddress)
  },
}
