import { WalletFormula } from '@/types'

/**
 * Get all contracts with the cw-ownable owner set to this address.
 */
export const ownedBy: WalletFormula<
  string[],
  {
    /**
     * Optionally filter by code ID key.
     */
    key?: string
  }
> = {
  compute: async ({
    walletAddress,
    args: { key },
    getTransformationMatches,
    getCodeIdsForKeys,
  }) =>
    (
      await getTransformationMatches(
        undefined,
        'owner',
        walletAddress,
        key ? getCodeIdsForKeys(key) : undefined
      )
    )?.map(({ contractAddress }) => contractAddress) ?? [],
}
