export type FormulaGetter = <T>(
  contractAddress: string,
  ...keys: (string | number)[]
) => Promise<T | undefined>

export type FormulaMapGetter = <
  K extends string | number = string | number,
  V = any
>(
  contractAddress: string,
  name: string,
  options?: {
    numericKeys?: boolean
  }
) => Promise<Record<K, V> | undefined>

export type FormulaDateGetter = (
  ...parameters: Parameters<FormulaGetter>
) => Promise<Date | undefined>

// Formulas compute a value for the state at one block height.
export type Formula<
  R,
  Args extends Record<string, string> | undefined = undefined
> = (env: Env<Args>) => Promise<R | undefined>

export type Env<Args extends Record<string, string> | undefined = undefined> = {
  contractAddress: string
  get: FormulaGetter
  getMap: FormulaMapGetter
  getDateKeyFirstSet: FormulaDateGetter
  args: Args extends undefined ? Record<string, any> : Args
} & (Args extends undefined ? Record<string, any> : { args: Args })
