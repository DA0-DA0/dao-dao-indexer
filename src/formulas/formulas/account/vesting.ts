import { Op } from 'sequelize'

import { AccountFormula } from '@/types'

export const ownerOf: AccountFormula<string[]> = {
  compute: async (env) => {
    const { address, getTransformationMatches, getCodeIdsForKeys } = env

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
            [Op.contains]: address,
          },
          cw1WhitelistCodeIds
        )) ?? []
      : []

    // Get all cw-vesting contracts with this wallet as the owner or a
    // cw1-whitelist contract where this wallet is an admin.
    const cwVestingContracts =
      (await getTransformationMatches(
        undefined,
        'owner',
        [
          address,
          ...cw1WhitelistContracts.map(
            ({ contractAddress }) => contractAddress
          ),
        ],
        cwVestingCodeIds
      )) ?? []

    return cwVestingContracts.map(({ contractAddress }) => contractAddress)
  },
}
