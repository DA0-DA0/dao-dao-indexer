import { ProposalStatus } from '@dao-dao/types/protobuf/codegen/cosmos/gov/v1/gov'
import { Options as PusherOptions } from 'pusher'
import { BindOrReplacements, WhereOptions } from 'sequelize'
import { SequelizeOptions } from 'sequelize-typescript'

import {
  Contract,
  DependableEventModel,
  StakingSlashEvent,
  State,
  WasmTxEvent,
} from '@/db'

type DB = { uri?: string } & Pick<
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

export type Config = {
  home: string
  rpc: string
  bech32Prefix: string
  db: {
    data: DB
    accounts: DB
  }
  redis?: {
    host?: string
    port?: number
    password: string
  }
  meilisearch?: {
    host: string
    apiKey?: string
  }
  // Map some arbitary string to a list of code IDs.
  codeIds?: Partial<Record<string, number[]>>

  // If present, sets up Sentry error reporting.
  sentryDsn?: string
  // Payment info.
  payment?: {
    // cw-receipt contract address where payments are tracked
    cwReceiptAddress: string
    // cw-receipt webhook secret
    cwReceiptWebhookSecret: string
    // native denom accepted for payments
    nativeDenomAccepted: string
    // Value to scale the payment amount by to get the credit amount. If 1 $USDC
    // is sent, since $USDC has 6 decimals, the payment amount will be 1e6. To
    // give 1e4 credits, the scale factor would be 0.01 (1e-2), since 1e6 * 1e-2
    // = 1e4.
    creditScaleFactor: number
  }
  // WebSockets Soketi server.
  soketi?: PusherOptions
  // Accounts server JWT secret.
  accountsJwtSecret?: string
  // Indexer exporter dashboard password.
  exporterDashboardPassword?: string

  // Other config options.
  [key: string]: any
}

export type MeilisearchIndexer = {
  /**
   * Unique ID for this meilisearch indexer.
   */
  id: string
  /**
   * The name of the index.
   */
  index: string
  /**
   * If true, the index will automatically be updated when a matching event
   * occurs. If false, it must be updated manually. Default: true.
   */
  automatic?: boolean
  /**
   * The attributes of the index used for filtering.
   */
  filterableAttributes?: string[]
  /**
   * The attributes of the index used for sorting.
   */
  sortableAttributes?: string[]
  /**
   * The matching function that should trigger an index update using the formula
   * returned. Returning `undefined` or `false` will not update the index.
   */
  matches: (options: {
    event: DependableEventModel
    state: State
  }) =>
    | MeilisearchIndexUpdate
    | undefined
    | false
    | Promise<MeilisearchIndexUpdate | undefined | false>
  /**
   * The function to bulk update the index when manually updating.
   */
  getBulkUpdates?: () => Promise<MeilisearchIndexUpdate[]>
}

export type MeilisearchIndexUpdate = {
  /**
   * A unique ID for this document in the index. Others will be overwritten.
   */
  id: string
  /**
   * The formula that should be executed and stored in the index.
   */
  formula: {
    type: FormulaType
    name: string
    targetAddress: string
    args?: Record<string, string>
  }
}

export type KeyInput = string | number | Uint8Array

export type FormulaGetter = <T>(
  contractAddress: string,
  ...keys: KeyInput[]
) => Promise<T | undefined>

export type FormulaPrefetch = (
  contractAddress: string,
  ...listOfKeys: (
    | KeyInput
    | {
        keys: KeyInput[]
        map?: boolean
      }
  )[]
) => Promise<void>

export type FormulaMapGetter = <
  K extends string | number = string | number,
  V = any
>(
  contractAddress: string,
  name: string | KeyInput[],
  options?: {
    // Default: 'string'. If 'string', the map key will be decoded assuming it's
    // a utf-8 string. If 'number', the map key will be decoded assuming it's a
    // big-endian integer. If 'raw', the map key will not be decoded and left in
    // the string format of comma-separated integers that represent uint8s. The
    // 'string' and 'number' decodings use `dbKeyToKeys` assuming only one key.
    keyType?: 'string' | 'number' | 'raw'
  }
) => Promise<Record<K, V> | undefined>

export type FormulaDateGetter = (
  ...parameters: Parameters<FormulaGetter>
) => Promise<Date | undefined>

export type FormulaDateWithValueMatchGetter = (
  contractAddress: string,
  keys: KeyInput[],
  whereClause: any
) => Promise<Date | undefined>

export type FormulaTransformationMatchesGetter = <T>(
  contractAddress: string | undefined,
  nameLike: string,
  // TODO(cache): figure out how this fits into the dependent key caching system
  whereClause?: any,
  whereCodeId?: number[],
  // TODO(cache): figure out how this fits into the dependent key caching system
  whereName?: any,
  // TODO(cache): figure out how this fits into the dependent key caching system
  limit?: number
) => Promise<
  | {
      block: Block
      contractAddress: string
      codeId: number
      name: string
      value: T
    }[]
  | undefined
>

export type FormulaTransformationMatchGetter = <T>(
  ...args: Parameters<FormulaTransformationMatchesGetter>
) => Promise<
  | { contractAddress: string; codeId: number; name: string; value: T }
  | undefined
>

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

export type FormulaContractGetter = (
  contractAddress: string
) => Promise<ContractJson | undefined>

export type FormulaContractCodeIdGetter = (
  ...params: Parameters<FormulaContractGetter>
) => Promise<number | undefined>

export type FormulaCodeIdsForKeysGetter = (...keys: string[]) => number[]

export type FormulaContractMatchesCodeIdKeysGetter = (
  contractAddress: string,
  ...keys: string[]
) => Promise<boolean>

export type FormulaCodeIdKeyForContractGetter = (
  contractAddress: string
) => Promise<string | undefined>

export type FormulaSlashEventsGetter = (
  validatorOperatorAddress: string
) => Promise<
  | Pick<
      StakingSlashEvent,
      | 'validatorOperatorAddress'
      | 'registeredBlockHeight'
      | 'registeredBlockTimeUnixMs'
      | 'registeredBlockTimestamp'
      | 'infractionBlockHeight'
      | 'slashFactor'
      | 'amountSlashed'
      | 'effectiveFraction'
      | 'stakedTokensBurned'
    >[]
  | undefined
>

export type FormulaTxEventsGetter = (
  contractAddress: string,
  where?: WhereOptions<WasmTxEvent>
) => Promise<
  | Pick<
      WasmTxEvent,
      | 'blockHeight'
      | 'blockTimeUnixMs'
      | 'blockTimestamp'
      | 'contractAddress'
      | 'action'
      | 'sender'
      | 'msgJson'
      | 'funds'
      | 'response'
    >[]
  | undefined
>

export type FormulaBalanceGetter = (
  address: string,
  denom: string
) => Promise<string | undefined>

export type FormulaBalancesGetter = (
  address: string
) => Promise<Record<string, string> | undefined>

export type FormulaCommunityPoolBalancesGetter = () => Promise<
  Record<string, string> | undefined
>

export type FormulaProposalObject = {
  id: string
  data: string
}

export type FormulaDecodedProposalObject = {
  id: number
  data: string
  title: string
  description: string
  status: ProposalStatus
  submitTime?: number
  depositEndTime?: number
  votingStartTime?: number
  votingEndTime?: number
}

export type FormulaProposalGetter = (
  proposalId: string
) => Promise<FormulaProposalObject | undefined>

export type FormulaProposalsGetter = (
  ascending?: boolean,
  limit?: number,
  offset?: number
) => Promise<FormulaProposalObject[] | undefined>

export type FormulaProposalCountGetter = () => Promise<number>

export type FormulaQuerier = (
  query: string,
  bindParams?: BindOrReplacements
) => Promise<Record<string, unknown>[]>

export type Env<Args extends Record<string, string> = {}> = {
  chainId: string
  block: Block
  /**
   * If latest block is being used, this will be the current date. If fetching
   * at a specific block, this will be the date of that block.
   */
  date: Date
  /**
   * Arguments may or may not be present, so force formula to handle undefined.
   */
  args: Partial<Args>

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
  getContract: FormulaContractGetter
  getCodeIdsForKeys: FormulaCodeIdsForKeysGetter
  contractMatchesCodeIdKeys: FormulaContractMatchesCodeIdKeysGetter
  getCodeIdKeyForContract: FormulaCodeIdKeyForContractGetter
  getSlashEvents: FormulaSlashEventsGetter
  getTxEvents: FormulaTxEventsGetter
  getBalance: FormulaBalanceGetter
  getBalances: FormulaBalancesGetter
  getProposal: FormulaProposalGetter
  getProposals: FormulaProposalsGetter
  getProposalCount: FormulaProposalCountGetter
  getCommunityPoolBalances: FormulaCommunityPoolBalancesGetter

  /**
   * Raw database query. This cannot be cached, so any formula that uses this
   * should be marked as `dynamic`.
   */
  query: FormulaQuerier
}

export interface EnvOptions {
  chainId: string
  block: Block
  /**
   * If latest block is being used, this will be false. If fetching at a
   * specific block, this will be true.
   */
  useBlockDate?: boolean

  args?: Record<string, any>
  dependentKeys?: ComputationDependentKey[]
  onFetch?: (events: DependableEventModel[]) => void | Promise<void>
  cache?: Partial<Cache>
}

export type ContractEnv<Args extends Record<string, string> = {}> =
  Env<Args> & {
    contractAddress: string
  }

export type WalletEnv<Args extends Record<string, string> = {}> = Env<Args> & {
  walletAddress: string
}

export type ValidatorEnv<Args extends Record<string, string> = {}> =
  Env<Args> & {
    validatorOperatorAddress: string
  }

// Formulas compute a value for the state at one block height.
export type Formula<R = any, E extends Env = Env> = {
  compute: (env: E) => Promise<R>
  // If true, the formula is non-deterministic within the same block, so it
  // cannot be cached. This likely means that some expiration is being checked
  // based on the latest time, which affects the output of the formula without
  // any state changing.
  dynamic?: boolean
}

export type ContractFormula<
  R = any,
  Args extends Record<string, string> = {}
> = Formula<R, ContractEnv<Args>> & {
  // If filters not satisfied, returns a 405 status.
  filter?: RequireAtLeastOne<{
    codeIdsKeys: string[]
  }>
}

export type WalletFormula<
  R = any,
  Args extends Record<string, string> = {}
> = Formula<R, WalletEnv<Args>>

export type GenericFormula<
  R = any,
  Args extends Record<string, string> = {}
> = Formula<R, Env<Args>>

export type ValidatorFormula<
  R = any,
  Args extends Record<string, string> = {}
> = Formula<R, ValidatorEnv<Args>>

export enum FormulaType {
  Contract = 'contract',
  Generic = 'generic',
  Validator = 'validator',
  Wallet = 'wallet',
}

export type TypedFormula = { name: string } & (
  | {
      type: FormulaType.Contract
      formula: ContractFormula
    }
  | {
      type: FormulaType.Wallet
      formula: WalletFormula
    }
  | {
      type: FormulaType.Generic
      formula: GenericFormula
    }
  | {
      type: FormulaType.Validator
      formula: ValidatorFormula
    }
)

export type ComputeOptions = {
  chainId: string
  targetAddress: string
  args: Record<string, any>
  block: Block
} & TypedFormula

export type ComputeRangeOptions = {
  chainId: string
  targetAddress: string
  args: Record<string, any>
  blockStart: Block
  blockEnd: Block
  blockStep?: bigint
  timeStep?: bigint
} & TypedFormula

export interface ComputationOutput {
  // Undefined if formula did not use any keys.
  block: Block | undefined
  value: any
  dependentKeys: ComputationDependentKey[]
  // Used when computing ranges.
  latestBlockHeightValid?: bigint
}

export type CacheMap<T> = Record<string, T[] | null | undefined>
export type CacheMapSingle<T> = Record<string, T | null | undefined>

export interface Cache {
  events: CacheMap<DependableEventModel>
  contracts: CacheMapSingle<Contract>
}

export type ComputationDependentKey = {
  key: string
  // This is used with maps for example, where a computation depends on all keys
  // that start with the map prefix.
  prefix: boolean
}

export type NestedFormulaMap<F> = {
  [key: string]: F | NestedFormulaMap<F> | undefined
}

export type ContractJson = {
  address: string
  codeId: number
  instantiatedAt: {
    block: Block
    timestamp: Date
  }
}

export type Block = {
  height: bigint
  timeUnixMs: bigint
}

export type SerializedBlock = {
  height: string
  timeUnixMs: string
}

export type ParsedWasmStateEvent = {
  type: 'state'
  codeId: number
  contractAddress: string
  blockHeight: string
  blockTimeUnixMs: string
  blockTimestamp: Date
  key: string
  value: string
  valueJson: any
  delete: boolean
}

export type ParsedWasmTxEvent = {
  type: 'tx'
  blockHeight: string
  blockTimeUnixMs: string
  blockTimestamp: Date
  txIndex: number
  messageId: string
  contractAddress: string
  codeId: number
  action: string
  sender: string
  msg: string | null
  msgJson: any
  reply: any | null
  funds: any
  response: any | null
  gasUsed: string
}

export type ParsedWasmEvent = ParsedWasmStateEvent | ParsedWasmTxEvent

export type ParsedBankStateEvent = {
  address: string
  blockHeight: string
  blockTimeUnixMs: string
  blockTimestamp: Date
  denom: string
  balance: string
}

export type ParsedDistributionCommunityPoolStateEvent = {
  blockHeight: string
  blockTimeUnixMs: string
  blockTimestamp: Date
  // Map denom to balance.
  balances: Record<string, string>
}

export type ParsedGovStateEvent = {
  proposalId: string
  blockHeight: string
  blockTimeUnixMs: string
  blockTimestamp: Date
  data: string
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
    matches: (event: ParsedWasmStateEvent) => boolean
  }>
  // If `name` returns `undefined`, the transformation will not be saved.
  name: string | ((event: ParsedWasmStateEvent) => string | undefined)
  // If `getValue` returns `undefined`, the transformation will not be saved.
  // All other values, including `null`, will be saved.
  getValue: (
    event: ParsedWasmStateEvent,
    getLastValue: () => Promise<V | null>
  ) => V | null | undefined | Promise<V | null | undefined>
  // By default, a transformation gets created with a value of `null` if the
  // event is a delete event, skipping evaluation of `getValue`. If
  // `manuallyTransformDelete` is set to true, `getValue` will be called and the
  // value returned will be used instead, as if it were not a delete event.
  manuallyTransformDeletes?: boolean
}

export type TransformerMaker = (config: Config) => Transformer

export type ProcessedTransformer<V = any> = Omit<Transformer<V>, 'filter'> & {
  filter: (event: ParsedWasmStateEvent) => boolean
}

export enum WebhookType {
  Url = 'url',
  Soketi = 'soketi',
}

export type WebhookEndpoint =
  | {
      type: WebhookType.Url
      url: string
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
      headers?: Record<string, string>
    }
  | {
      type: WebhookType.Soketi
      channel: string | string[]
      event: string
    }

export type Webhook<
  Event extends DependableEventModel = DependableEventModel,
  Value = any
> = {
  filter: {
    /**
     * Required to filter events by type. This should be set to the class itself
     * of the type of event to consider. This can be any class that extends
     * DependableEventModel, such as WasmStateEvent or GovStateEvent.
     */
    EventType: new (...args: any) => Event
  } & Partial<{
    /**
     * If passed, contract must match one of these code IDs keys.
     *
     * Only relevant when event is a WasmStateEvent.
     */
    codeIdsKeys: string[]
    /**
     * If passed, contract must match one of these contract addresses.
     *
     * Only relevant when event is a WasmStateEvent.
     */
    contractAddresses: string[]
    /**
     * A function to support any custom matching logic.
     */
    matches: (event: Event) => boolean
  }>
  // If returns undefined, the webhook will not be called.
  endpoint:
    | WebhookEndpoint
    | undefined
    | ((event: Event, env: Env) => WebhookEndpoint | undefined)
    | ((event: Event, env: Env) => Promise<WebhookEndpoint | undefined>)
  // If returns undefined, the webhook will not be called.
  getValue: (
    event: Event,
    getLastEvent: () => Promise<Event | null>,
    env: Env
  ) => Value | undefined | Promise<Value | undefined>
}

export type WebhookMaker<
  Event extends DependableEventModel = DependableEventModel,
  Value = any
> = (config: Config, state: State) => Webhook<Event, Value> | null | undefined

export type ProcessedWebhook<
  Event extends DependableEventModel = DependableEventModel,
  Value = any
> = Omit<Webhook<Event, Value>, 'filter'> & {
  filter: (event: Event) => boolean
}

export type PendingWebhook = {
  eventType: string
  eventId: number
  endpoint: WebhookEndpoint
  value: any
}

export enum DbType {
  Accounts = 'accounts',
  Data = 'data',
}

export enum QueueName {
  Export = 'export',
  Webhooks = 'webhooks',
  Search = 'search',
}

/**
 * A pending index update queued in the worker.
 */
export type PendingMeilisearchIndexUpdate = {
  /**
   * The meilisearch index to update.
   */
  index: string
  /**
   * The update to apply.
   */
  update: MeilisearchIndexUpdate
}
