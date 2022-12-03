export type FormulaGetter = <T = any>(
  contractAddress: string,
  ...keys: string[]
) => Promise<T | undefined>

// Formulas compute a value for the state at one block height.
export type Formula<R = any> = (
  contractAddress: string,
  get: FormulaGetter
) => Promise<R>
