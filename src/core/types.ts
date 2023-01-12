import { WhereOptions } from 'sequelize'
import { SequelizeOptions } from 'sequelize-typescript'

import { Event, State, Transformation } from '@/db'

export type Config = {
  eventsFile: string
  statusEndpoint: string
  db: { uri?: string } & Pick<
    SequelizeOptions,
    | 'dialect'
    | 'dialectModulePath'
    | 'dialectOptions'
    | 'storage'
    | 'database'
    | 'username'
    | 'password'
    | 'host'
    | 'port'
    | 'ssl'
    | 'protocol'
    | 'pool'
    | 'schema'
    | 'logging'
  >
  meilisearch?: {
    host: string
    apiKey?: string
    indexes: {
      index: string
      filterableAttributes?: string[]
      formula: string
      args?: Record<string, any>
      // One of `codeIdsKeys` or `contractAddresses` must be present.
      codeIdsKeys?: number[]
      contractAddresses?: string[]
    }[]
  }
  // Map some arbitary string to a list of code IDs.
  codeIds: Record<string, number[] | undefined>

  // Other config options.
  [key: string]: any
}

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

export type FormulaTransformationMatchesGetter = <T>(
  contractAddress: string | undefined,
  nameLike: string,
  whereClause?: WhereOptions
) => Promise<{ contractAddress: string; name: string; value: T }[] | undefined>

export type FormulaTransformationMatchGetter = <T>(
  ...args: Parameters<FormulaTransformationMatchesGetter>
) => Promise<{ contractAddress: string; name: string; value: T } | undefined>

export type FormulaTransformationDateGetter = (
  ...parameters: Parameters<FormulaTransformationMatchGetter>
) => Promise<Date | undefined>

export type FormulaTransformationMapGetter = <
  K extends string | number = string | number,
  V = any
>(
  contractAddress: string,
  namePrefix: string
) => Promise<Record<K, V> | undefined>

export type FormulaPrefetchTransformations = (
  contractAddress: string,
  // Names must not contain wildcards.
  listOfNames: (
    | string
    | {
        name: string
        map: true
      }
  )[]
) => Promise<void>

export type Env<Args extends Record<string, string> = {}> = {
  block: Block
  // If latest block is being used, this will be the current date. If fetching
  // at a specific block, this will be the date of that block.
  date: Date

  get: FormulaGetter
  getMap: FormulaMapGetter
  getDateKeyModified: FormulaDateGetter
  getDateKeyFirstSet: FormulaDateGetter
  getDateKeyFirstSetWithValueMatch: FormulaDateWithValueMatchGetter
  getTransformationMatch: FormulaTransformationMatchGetter
  getTransformationMatches: FormulaTransformationMatchesGetter
  getTransformationMap: FormulaTransformationMapGetter
  getDateFirstTransformed: FormulaTransformationDateGetter
  prefetch: FormulaPrefetch
  prefetchTransformations: FormulaPrefetchTransformations
  // Arguments may or may not be present, so force formula to handle undefined.
  args: Partial<Args>
}

export interface EnvOptions {
  block: Block
  // If latest block is being used, this will be false. If fetching at a
  // specific block, this will be true.
  useBlockDate?: boolean

  args?: Record<string, any>
  dependencies?: SetDependencies
  onFetch?: (
    events: Event[],
    transformations: Transformation[]
  ) => void | Promise<void>
  cache?: Cache
}

export type ContractEnv<Args extends Record<string, string> = {}> =
  Env<Args> & {
    contractAddress: string
  }

export type WalletEnv<Args extends Record<string, string> = {}> = Env<Args> & {
  walletAddress: string
}

// Formulas compute a value for the state at one block height.
export type ContractFormula<
  R = any,
  Args extends Record<string, string> = {}
> = {
  compute: (env: ContractEnv<Args>) => Promise<R>
  // If true, the formula is dynamic based on block input. This likely means
  // that some expiration is being computed, which affects the output of the
  // formula without any state changing.
  dynamic?: boolean
}

export type WalletFormula<R = any, Args extends Record<string, string> = {}> = {
  compute: (env: WalletEnv<Args>) => Promise<R>
  // If true, the formula is dynamic based on block input. This likely means
  // that some expiration is being computed, which affects the output of the
  // formula without any state changing.
  dynamic?: boolean
}

export type GenericFormula<
  R = any,
  Args extends Record<string, string> = {}
> = {
  compute: (env: Env<Args>) => Promise<R>
  // If true, the formula is dynamic based on block input. This likely means
  // that some expiration is being computed, which affects the output of the
  // formula without any state changing.
  dynamic?: boolean
}

export enum FormulaType {
  Contract = 'contract',
  Wallet = 'wallet',
  Generic = 'generic',
}

export type TypedFormula = { name: string } & (
  | {
      type: FormulaType.Contract
      formula: ContractFormula<any, any>
    }
  | {
      type: FormulaType.Wallet
      formula: WalletFormula<any, any>
    }
  | {
      type: FormulaType.Generic
      formula: GenericFormula<any, any>
    }
)

export type ComputeOptions = {
  targetAddress: string
  args: Record<string, any>
  block: Block
} & TypedFormula

export type ComputeRangeOptions = {
  targetAddress: string
  args: Record<string, any>
  blockStart: Block
  blockEnd: Block
} & TypedFormula

export interface ComputationOutput {
  // Undefined if formula did not use any keys.
  block: Block | undefined
  value: any
  dependencies: Dependencies
  // Used when computing ranges.
  latestBlockHeightValid?: number
}

export interface Dependencies {
  events: string[]
  transformations: string[]
}

export interface SetDependencies {
  events: Set<string>
  transformations: Set<string>
}

export type CacheMap<T> = Record<string, T[] | null | undefined>

export interface Cache {
  events: CacheMap<Event>
  transformations: CacheMap<Transformation>
}

export interface SplitDependentKeys {
  nonMapKeys: string[]
  mapPrefixes: string[]
}

export type NestedFormulaMap<F> = {
  [key: string]: F | NestedFormulaMap<F> | undefined
}

export type Block = {
  height: number
  timeUnixMs: number
}

export type IndexerEvent = {
  blockHeight: number
  blockTimeUnixMicro: number
  contractAddress: string
  codeId: number
  key: string
  value: string
  delete: boolean
}

export type ParsedEvent = {
  codeId: number
  contractAddress: string
  blockHeight: number
  blockTimeUnixMs: number
  blockTimestamp: Date
  key: string
  value: string
  valueJson: any
  delete: boolean
}

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
  }[Keys]

export type Transformer<V = any> = {
  filter: RequireAtLeastOne<{
    codeIdsKeys: string[]
    contractAddresses: string[]
    matches: (event: ParsedEvent) => boolean
  }>
  name: string | ((event: ParsedEvent) => string)
  getValue: (
    event: ParsedEvent,
    getLastValue: () => Promise<V | null>
  ) => V | null | Promise<V | null>
  // By default, a transformation gets created with a value of `null` if the
  // event is a delete event, skipping evaluation of `getValue`. If
  // `manuallyTransformDelete` is set to true, `getValue` will be called and the
  // value returned will be used instead, as if it were not a delete event.
  manuallyTransformDeletes?: boolean
}

export type TransformerMaker = (config: Config) => Transformer

export type ProcessedTransformer<V = any> = Omit<Transformer<V>, 'filter'> & {
  filter: (event: ParsedEvent) => boolean
}

export type WebhookEndpoint = {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
}

export type Webhook<V = any> = {
  filter: RequireAtLeastOne<{
    codeIdsKeys: string[]
    contractAddresses: string[]
    matches: (event: Event) => boolean
  }>
  // If returns undefined, the webhook will not be called.
  endpoint:
    | WebhookEndpoint
    | undefined
    | ((event: Event, env: ContractEnv) => WebhookEndpoint | undefined)
    | ((event: Event, env: ContractEnv) => Promise<WebhookEndpoint | undefined>)
  // If returns undefined, the webhook will not be called.
  getValue: (
    event: Event,
    getLastEvent: () => Promise<Event | null>,
    env: ContractEnv
  ) => V | undefined | Promise<V | undefined>
}

export type WebhookMaker = (config: Config, state: State) => Webhook

export type ProcessedWebhook<V = any> = Omit<Webhook<V>, 'filter'> & {
  filter: (event: Event) => boolean
}

export type PendingWebhook = {
  endpoint: WebhookEndpoint
  value: any
}
