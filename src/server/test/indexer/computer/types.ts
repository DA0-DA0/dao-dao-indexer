import { AccountKeyCredit } from '@/db'
import { ContractFormula } from '@/formulas/types'

export type ComputerTestOptions = {
  apiKey: string
  credit: AccountKeyCredit
  mockFormula: (formula?: Partial<ContractFormula>) => jest.Mock
  unmockFormula: () => void
}
