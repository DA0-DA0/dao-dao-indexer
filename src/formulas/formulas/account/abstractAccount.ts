import { AccountFormula } from '@/types'
import { AccountTypes } from '../contract/abstract/types'

/**
 * Get all contracts with the account governance owner set to this address.
 */
export const accountsOwnedBy: AccountFormula<
  string[],
  {
    /**
     * Optionally filter by code ID key.
     */
    key?: string
  }
> = {
  docs: {
    description:
      'retrieves account (that use abstract governance to manage ownership) where the account is the owner',
    args: [
      {
        name: 'key',
        description: 'optional code ID key to filter by',
        required: false,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  compute: async (env) => {
    const {
      args: { key },
      address,
      getTransformationMatches,
      getCodeIdsForKeys,
    } = env

    const monarchyOwned =
      (
        await getTransformationMatches(
          undefined,
          'owner',
          {
            monarchy: {
              monarch: address,
            },
          } satisfies AccountTypes.GovernanceDetailsForString,
          key ? getCodeIdsForKeys(key) : undefined
        )
      )?.map(({ contractAddress }) => contractAddress) || []

    const subAccountOwned =
      (
        await getTransformationMatches(
          undefined,
          'owner',
          {
            sub_account: {
              account: address,
            },
          } satisfies AccountTypes.GovernanceDetailsForString,
          key ? getCodeIdsForKeys(key) : undefined
        )
      )?.map(({ contractAddress }) => contractAddress) || []

    const abstractAccountOwned =
      (
        await getTransformationMatches(
          undefined,
          'owner',
          {
            abstract_account: {
              address: address,
            },
          } satisfies AccountTypes.GovernanceDetailsForString,
          key ? getCodeIdsForKeys(key) : undefined
        )
      )?.map(({ contractAddress }) => contractAddress) || []

    return monarchyOwned.concat(subAccountOwned, abstractAccountOwned)
  },
}
