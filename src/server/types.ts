export type FormulaGetter = <T = any>(
  contractAddress: string,
  ...keys: string[]
) => Promise<T | null>

// Formulas compute a value for the state at one block height.
export type Formula<R = any> = (env: Env) => Promise<R>

export interface Env {
  contractAddress: string
  get: FormulaGetter
}
