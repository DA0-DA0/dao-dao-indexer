export type FormulaGetter = <T>(
  contractAddress: string,
  ...keys: string[]
) => Promise<T | undefined>

export type FormulaDateGetter = (
  ...parameters: Parameters<FormulaGetter>
) => Promise<Date | undefined>

// Formulas compute a value for the state at one block height.
export type Formula<R, Args extends Record<string, any> = {}> = (
  env: Env<Args>
) => Promise<R>

export interface Env<Args extends Record<string, any> = {}> {
  contractAddress: string
  get: FormulaGetter
  getCreatedAt: FormulaDateGetter
  args?: Args
}
