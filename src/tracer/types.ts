import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'

import { Config } from '@/core/types'
import { DependableEventModel } from '@/db'

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
  // The function that will be called with queued objects. Returns created
  // events.
  process: (data: Data[]) => Promise<DependableEventModel[]>
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

export type NamedHandler = {
  name: string
  handler: Handler
}

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
