import * as utils from '@/formulas/utils'

export const getTypedFormula = jest.spyOn(utils, 'getTypedFormula')

// Creates mocks with default implementations.
export const restoreOriginalMocks = () => {
  getTypedFormula.mockReset()
}

restoreOriginalMocks()
