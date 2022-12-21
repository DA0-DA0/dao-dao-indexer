export type FormulaGetter = <T>(
  contractAddress: string,
  ...keys: (string | number)[]
) => Promise<T | undefined>

export type FormulaPrefetch = (
  contractAddress: string,
  ...listOfKeys: (
    | string
    | number
    | {
        keys: (string | number)[]
        map?: boolean
      }
  )[]
) => Promise<void>

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
  block: Block
  get: FormulaGetter
  getMap: FormulaMapGetter
  getDateKeyModified: FormulaDateGetter
  getDateKeyFirstSet: FormulaDateGetter
  prefetch: FormulaPrefetch
  args: Args extends undefined ? Record<string, any> : Args
} & (Args extends undefined ? Record<string, any> : { args: Args })

export interface ComputationOutput {
  // Undefined if formula did not use any keys.
  block: Block | undefined
  value: any
  // List of contractAddress:key pairs that this formula depends on.
  dependentKeys: string[]
}

export type NestedFormulaMap = {
  [key: string]: Formula<any, any> | NestedFormulaMap | undefined
}

export type Block = {
  height: number
  timeUnixMs: number
}
