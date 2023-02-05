import { ContractFormula } from '@/core'

export const receiptTotals: ContractFormula<[string, any][], { id: string }> = {
  compute: async ({ contractAddress, getMap, args: { id } }) =>
    Object.entries(
      (await getMap(contractAddress, ['receipt_totals', id!])) ?? {}
    ),
}
