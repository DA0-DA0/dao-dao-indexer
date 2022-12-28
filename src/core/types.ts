import { WhereOptions } from 'sequelize'

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

export type FormulaDateWithValueMatchGetter = (
  contractAddress: string,
  keys: (string | number)[],
  whereClause: WhereOptions
) => Promise<Date | undefined>

export type FormulaValueMatchGetter = <T>(
  keys: (string | number | { wildcard: true })[],
  whereClause?: WhereOptions
) => Promise<
  { contractAddress: string; block: Block; key: string; value: T }[] | undefined
>

// Formulas compute a value for the state at one block height.
export type ContractFormula<
  R = any,
  Args extends Record<string, string> | undefined = undefined
> = (env: ContractEnv<Args>) => Promise<R>

export type ContractEnv<
  Args extends Record<string, string> | undefined = undefined
> = {
  contractAddress: string
  block: Block
  get: FormulaGetter
  getMap: FormulaMapGetter
  getDateKeyModified: FormulaDateGetter
  getDateKeyFirstSet: FormulaDateGetter
  getDateKeyFirstSetWithValueMatch: FormulaDateWithValueMatchGetter
  prefetch: FormulaPrefetch
  args: Args extends undefined ? Record<string, any> : Args
} & (Args extends undefined ? Record<string, any> : { args: Args })

export type WalletFormula<
  R = any,
  Args extends Record<string, string> | undefined = undefined
> = (env: WalletEnv<Args>) => Promise<R>

export type WalletEnv<
  Args extends Record<string, string> | undefined = undefined
> = {
  walletAddress: string
  block: Block
  get: FormulaGetter
  getMap: FormulaMapGetter
  getDateKeyModified: FormulaDateGetter
  getDateKeyFirstSet: FormulaDateGetter
  getDateKeyFirstSetWithValueMatch: FormulaDateWithValueMatchGetter
  getWhereValueMatches: FormulaValueMatchGetter
  prefetch: FormulaPrefetch
  args: Args extends undefined ? Record<string, any> : Args
} & (Args extends undefined ? Record<string, any> : { args: Args })

export interface ComputationOutput {
  // Undefined if formula did not use any keys.
  block: Block | undefined
  value: any
  // List of contractAddress:key pairs that this formula depends on.
  dependentKeys: string[]
  // Used when computing ranges.
  latestBlockHeightValid?: number
}

export type NestedFormulaMap<F> = {
  [key: string]: F | NestedFormulaMap<F> | undefined
}

export type Block = {
  height: number
  timeUnixMs: number
}
