import { GenericFormula } from '@/types'

export const balances: GenericFormula<Record<string, string>> = {
  compute: async ({ getCommunityPoolBalances }) =>
    (await getCommunityPoolBalances()) || {},
}
