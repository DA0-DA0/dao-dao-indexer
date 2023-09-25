import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'

import { Config } from '@/core'

export type Handler = {
  // What store name to filter by for events to handle.
  storeName: string
  // The function that will be called for each trace in the trace file.
  handle: (trace: TracedEvent) => Promise<void>
  // The function that will be called after reading the entire trace file.
  flush: () => Promise<void>
}

export type HandlerMakerOptions = {
  config: Config
  dontUpdateComputations: boolean
  dontSendWebhooks: boolean
  cosmWasmClient: CosmWasmClient
  getBlockTimeUnixMs: (
    blockHeight: number,
    trace: TracedEvent
  ) => Promise<number>
}

export type HandlerMaker = (options: HandlerMakerOptions) => Promise<Handler>

export type TracedEvent = {
  operation: 'read' | 'write' | 'delete'
  key: string
  value: string
  metadata: {
    blockHeight: number
    txHash: string
    store_name: string
  }
}

export type WorkerInitData = {
  config: Config
  update: boolean
  webhooks: boolean
  websocket: boolean
}

export type ToWorkerMessage =
  | {
      type: 'trace'
      event: TracedEvent
    }
  | {
      type: 'shutdown'
    }

export type FromWorkerMessage =
  | {
      type: 'ready'
    }
  | {
      type: 'processed'
      count: number
    }
