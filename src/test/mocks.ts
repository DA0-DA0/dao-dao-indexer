import { vi } from 'vitest'

import * as utils from '@/formulas/utils'

export const getTypedFormula = vi.spyOn(utils, 'getTypedFormula')

// Creates mocks with default implementations.
export const restoreOriginalMocks = () => {
  getTypedFormula.mockReset()
}

restoreOriginalMocks()
