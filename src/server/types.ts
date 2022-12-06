export type FormulaGetter = <T>(
  contractAddress: string,
  ...keys: (string | number)[]
) => Promise<T | undefined>

export type FormulaDateGetter = (
  ...parameters: Parameters<FormulaGetter>
) => Promise<Date | undefined>

// Formulas compute a value for the state at one block height.
export type Formula<R, Args extends Record<string, string> = {}> = (
  env: Env<Args>
) => Promise<R>

export interface Env<Args extends Record<string, string> = {}> {
  contractAddress: string
  get: FormulaGetter
  getDateKeyFirstSet: FormulaDateGetter
  args?: Args
}
