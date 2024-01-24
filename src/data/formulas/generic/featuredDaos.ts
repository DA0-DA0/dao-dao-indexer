import { GenericFormula } from '@/core'

import featuredDaosPerChain from './featured_daos.json'

export const featuredDaos: GenericFormula<string[]> = {
  dynamic: true,
  compute: async (env) =>
    featuredDaosPerChain[env.chainId as keyof typeof featuredDaosPerChain] ||
    [],
}
