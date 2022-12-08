export type FormulaGetter = <T>(
  contractAddress: string,
  ...keys: (string | number)[]
) => Promise<T | undefined>

export type FormulaMapGetter = <
  K extends string | number = string | number,
  V = any
>(
  contractAddress: string,
  name: string | (string | number)[],
  options?: {
    numericKeys?: boolean
  }
) => Promise<Record<K, V> | undefined>

export type FormulaDateGetter = (
  ...parameters: Parameters<FormulaGetter>
) => Promise<Date | undefined>

// Formulas compute a value for the state at one block height.
export type Formula<
  R = any,
  Args extends Record<string, string> | undefined = undefined
> = (env: Env<Args>) => Promise<R>

export type Env<Args extends Record<string, string> | undefined = undefined> = {
  contractAddress: string
  get: FormulaGetter
  getMap: FormulaMapGetter
  getDateKeyModified: FormulaDateGetter
  getDateKeyFirstSet: FormulaDateGetter
  args: Args extends undefined ? Record<string, any> : Args
} & (Args extends undefined ? Record<string, any> : { args: Args })

export interface ComputationOutput {
  blockHeight: bigint
  blockTimeUnixMicro: bigint
  value: any
}

export type NestedFormulaMap = {
  [key: string]: Formula<any, any> | NestedFormulaMap | undefined
}
