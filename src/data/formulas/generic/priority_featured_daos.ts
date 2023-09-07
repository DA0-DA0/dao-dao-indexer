import { GenericFormula } from '@/core'

import priorityFeaturedDaosPerChain from './priority_featured_daos.json'

export const priorityFeaturedDaos: GenericFormula<string[]> = {
  dynamic: true,
  compute: async (env) =>
    priorityFeaturedDaosPerChain[
      env.chainId as keyof typeof priorityFeaturedDaosPerChain
    ] || [],
}
