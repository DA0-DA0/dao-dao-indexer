import { AccountFormula } from '@/types'

/**
 * Get all contracts with the cw-ownable owner set to this address.
 */
export const ownedBy: AccountFormula<
  string[],
  {
    /**
     * Optionally filter by code ID key.
     */
    key?: string
  }
> = {
  compute: async ({
    address,
    args: { key },
    getTransformationMatches,
    getCodeIdsForKeys,
  }) =>
    (
      await getTransformationMatches(
        undefined,
        'owner',
        address,
        key ? getCodeIdsForKeys(key) : undefined
      )
    )?.map(({ contractAddress }) => contractAddress) ?? [],
}
