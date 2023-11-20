import { Op } from 'sequelize'

import { WalletFormula } from '@/core'

export const ownerOf: WalletFormula<string[]> = {
  compute: async (env) => {
    const { walletAddress, getTransformationMatches, getCodeIdsForKeys } = env

    const cwVestingCodeIds = getCodeIdsForKeys('cw-vesting')
    if (!cwVestingCodeIds.length) {
      throw new Error('missing cw-vesting code IDs')
    }

    // Get all cw1-whitelist contracts with this wallet as an admin.
    const cw1WhitelistCodeIds = getCodeIdsForKeys('cw1-whitelist')
    const cw1WhitelistContracts = cw1WhitelistCodeIds.length
      ? (await getTransformationMatches(
          undefined,
          'admins',
          {
            [Op.contains]: walletAddress,
          },
          cw1WhitelistCodeIds
        )) ?? []
      : []

    // Get all cw-vesting contracts with this wallet as the owner or a
    // cw1-whitelist contract where this wallet is an admin.
    const cwVestingContracts = (
      await Promise.all([
        getTransformationMatches(
          undefined,
          `owner:${walletAddress}`,
          undefined,
          cwVestingCodeIds
        ),
        ...cw1WhitelistContracts.map(({ contractAddress }) =>
          getTransformationMatches(
            undefined,
            `owner:${contractAddress}`,
            undefined,
            cwVestingCodeIds
          )
        ),
      ])
    ).flatMap((m) => m ?? [])

    return cwVestingContracts.map(({ contractAddress }) => contractAddress)
  },
}
