import { GenericFormula } from '@/types'

export const balances: GenericFormula<Record<string, string>> = {
  docs: {
    description: 'retrieves the current balances of the community pool',
  },
  compute: async ({ getCommunityPoolBalances }) =>
    (await getCommunityPoolBalances()) || {},
}
