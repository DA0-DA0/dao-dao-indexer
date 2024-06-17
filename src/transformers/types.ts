import { ParsedWasmStateEvent, ProcessedTransformer } from '@/core/types'

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
