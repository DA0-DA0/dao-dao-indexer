import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import { LRUCache } from 'lru-cache'

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
  // Map block height to time. Populated with block heights from WebSocket's
  // NewBlock event as soon as it occurs, which is before any state writes.
  blockHeightToTimeCache: LRUCache<number, number>
  dontUpdateComputations: boolean
  dontSendWebhooks: boolean
}

export type HandlerMaker = (options: HandlerMakerOptions) => Promise<Handler>

export type TracedEvent = {
  operation: 'read' | 'write' | 'delete'
  key: string
  value: string
  metadata: {
    blockHeight: number
    txHash: string
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
