import { GenericFormula } from '@/core'

import featuredDaosPerChain from './featured_daos.json'

export const featuredDaos: GenericFormula<
  {
    address: string
    order: number
  }[]
> = {
  dynamic: true,
  compute: async (env) =>
    featuredDaosPerChain
      .map((data, index) => ({
        ...data,
        order: index + 1,
      }))
      .filter(({ chainId }) => chainId === env.chainId),
}
