import { Config } from './config'
import { RequireAtLeastOne } from './misc'
import { ParsedWasmStateEvent } from './tracer'

export type Transformer<V = any> = {
  filter: RequireAtLeastOne<{
    codeIdsKeys: string[] | 'any'
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

export type PendingTransformation = {
  contractAddress: string
  blockHeight: string
  blockTimeUnixMs: string
  name: string
  value: any | null
}

export type UnevaluatedEventTransformation = {
  event: ParsedWasmStateEvent
  transformer: ProcessedTransformer
  pendingTransformation: PendingTransformation
}
