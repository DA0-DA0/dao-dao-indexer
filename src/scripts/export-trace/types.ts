import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'

import { Config } from '@/core'

export type Handler = {
  // The function that will be called for each trace in the trace file. If the
  // trace was successfully handled, return true. Otherwise, return false.
  handle: (trace: TracedEvent) => Promise<boolean>
  // The function that will be called after reading the entire trace file.
  flush: () => Promise<void>
}

export type HandlerMakerOptions = {
  cosmWasmClient: CosmWasmClient
  config: Config
  batch: number
  updateComputations: boolean
  sendWebhooks: boolean
}

export type HandlerMaker = (options: HandlerMakerOptions) => Promise<Handler>

export type TracedEvent = {
  operation: 'write' | 'delete'
  key: string
  value: string
  metadata: {
    blockHeight: number
    txHash: string
  }
}
