export type FormulaGetter<T = any> = <R = T>(
  contractAddress: string,
  ...keys: string[]
) => Promise<R | undefined>

// Formulas compute a value for the state at one block height.
export type Formula<R> = (env: Env) => Promise<R>

export interface Env {
  contractAddress: string
  get: FormulaGetter
  getCreatedAt: FormulaGetter<Date>
  args?: Record<string, any>
}
