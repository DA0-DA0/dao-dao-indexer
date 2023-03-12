export const getTypedFormula = jest.fn()

const mocks = {
  '@/data/utils': {
    getTypedFormula,
  },
}

// Creates mocks with default implementations.
export const restoreOriginalMocks = () => {
  Object.entries(mocks).forEach(([module, mocks]) => {
    jest.mock(module, () => mocks)

    // Mock with default implementation unless overridden.
    Object.entries(mocks).forEach(([name, mock]) => {
      mock.mockImplementation(jest.requireActual(module)[name])
    })
  })
}

restoreOriginalMocks()
