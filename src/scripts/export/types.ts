import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'

import { Config } from '@/core'

export type Handler<Data extends unknown = unknown> = {
  // What store name to filter by for events to handle.
  storeName: string
  // The function that will be called for each trace which determines if it will
  // be queued for export. If returns an object, it will be queued. If returns
  // undefined, it will not be queued.
  match: (trace: TracedEventWithBlockTime) =>
    | (Data & {
        // ID that uniquely represents this object. Likely a combination of
        // block height and some key or keys.
        id: string
      })
    | undefined
  // The function that will be called with queued objects.
  process: (data: Data[]) => Promise<void>
}

export type HandlerMakerOptions = {
  config: Config
  updateComputations: boolean
  sendWebhooks: boolean
  cosmWasmClient: CosmWasmClient
}

export type HandlerMaker<Data extends unknown = unknown> = (
  options: HandlerMakerOptions
) => Promise<Handler<Data>>

export type TracedEvent = {
  operation: 'read' | 'write' | 'delete'
  key: string
  value: string
  metadata: {
    blockHeight: number
    txHash?: string
    store_name?: string
  }
}

export type TracedEventWithBlockTime = TracedEvent & {
  blockTimeUnixMs: number
}

export type WorkerInitData = {
  config: Config
  update: boolean
  webhooks: boolean
  websocket: boolean
}

export type ExportQueueData = {
  handler: string
  data: unknown
}
