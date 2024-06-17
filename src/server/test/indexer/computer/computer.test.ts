import { AccountKeyCredit } from '@/db'
import { getTypedFormula, restoreOriginalMocks } from '@/test/mocks'
import { getAccountWithAuth } from '@/test/utils'
import { ContractFormula, FormulaType, TypedFormula } from '@/types'

import { loadCreditsTests } from './credits'
import { loadFormulasTests } from './formulas'
import { ComputerTestOptions } from './types'
import { loadValidationsTests } from './validations'

const mockFormula = (formula?: Partial<ContractFormula>) =>
  getTypedFormula.mockImplementation((type: FormulaType, name: string) => {
    if (name === 'invalid') {
      throw new Error(`Formula not found: ${name}`)
    }

    return {
      name,
      type,
      formula: {
        compute: async () => '',
        ...formula,
      },
    } as TypedFormula
  })

describe('computer: GET /(.*)', () => {
  const options: ComputerTestOptions = {
    apiKey: '',
    credit: {} as AccountKeyCredit,
    mockFormula,
    unmockFormula: restoreOriginalMocks,
  }
  beforeEach(async () => {
    const { paidApiKey, paidCredit } = await getAccountWithAuth()
    options.apiKey = paidApiKey
    options.credit = paidCredit
  })

  loadValidationsTests(options)
  loadCreditsTests(options)
  loadFormulasTests(options)
})
