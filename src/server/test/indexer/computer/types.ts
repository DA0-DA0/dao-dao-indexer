import { MockInstance } from 'vitest'

import { AccountKeyCredit } from '@/db'
import { ContractFormula } from '@/types'

export type ComputerTestOptions = {
  apiKey: string
  credit: AccountKeyCredit
  mockFormula: (formula?: Partial<ContractFormula>) => MockInstance
  unmockFormula: () => void
}
