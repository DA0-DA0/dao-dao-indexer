import { Op } from 'sequelize'

import { accountId } from '@/formulas/formulas/contract/abstract/account'
import { AccountFormula } from '@/types'

import { AccountTypes } from '../contract/abstract/types'

/**
 * Get all contracts with the account governance owner set to this address.
 */
export const accountsOwnedBy: AccountFormula<
  { id: AccountTypes.AccountId | null; address: AccountTypes.Addr }[],
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

    const owned =
      (
        await getTransformationMatches(
          undefined,
          'owner',
          {
            [Op.or]: [
              {
                monarchy: {
                  monarch: address,
                },
              } satisfies AccountTypes.GovernanceDetailsForString,
              {
                sub_account: {
                  account: address,
                },
              } satisfies AccountTypes.GovernanceDetailsForString,
              {
                abstract_account: {
                  address: address,
                },
              } satisfies AccountTypes.GovernanceDetailsForString,
            ],
          },
          key ? getCodeIdsForKeys(key) : undefined
        )
      )?.map(({ contractAddress }) => contractAddress) || []

    return await Promise.all(
      owned.map(async (account) => ({
        address: account,
        id: await accountId.compute({
          ...env,
          contractAddress: account,
        }),
      }))
    )
  },
}
