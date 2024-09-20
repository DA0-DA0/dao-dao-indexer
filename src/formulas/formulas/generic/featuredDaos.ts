import { GenericFormula } from '@/types'

import allFeaturedDaos from './featured_daos.json'

export const featuredDaos: GenericFormula<
  {
    address: string
    order: number
  }[]
> = {
  docs: {
    description:
      'retrieves a list of featured DAOs for the current chain, with the order number from the entire featured list',
  },
  dynamic: true,
  compute: async (env) =>
    allFeaturedDaos
      .map((data, index) => ({
        ...data,
        order: index + 1,
      }))
      .filter(({ chainId }) => chainId === env.chainId),
}
