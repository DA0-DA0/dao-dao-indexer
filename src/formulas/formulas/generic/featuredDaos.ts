import { GenericFormula } from '../../types'
import allFeaturedDaos from './featured_daos.json'

export const featuredDaos: GenericFormula<
  {
    address: string
    order: number
  }[]
> = {
  dynamic: true,
  compute: async (env) =>
    allFeaturedDaos
      .map((data, index) => ({
        ...data,
        order: index + 1,
      }))
      .filter(({ chainId }) => chainId === env.chainId),
}
