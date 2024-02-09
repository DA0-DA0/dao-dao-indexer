import { GenericFormula } from '@/core'

export const balances: GenericFormula<Record<string, string>> = {
  compute: async ({ getCommunityPoolBalances }) =>
    (await getCommunityPoolBalances()) || {},
}
