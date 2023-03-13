import { ContractFormula } from '@/core/types'
import { AccountKeyCredit } from '@/db'

export type ComputerTestOptions = {
  apiKey: string
  credit: AccountKeyCredit
  mockFormula: (formula?: Partial<ContractFormula>) => jest.Mock
  unmockFormula: () => void
}
