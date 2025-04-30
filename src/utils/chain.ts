import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import { StargateClient } from '@cosmjs/stargate'
import {
  Comet38Client,
  HttpBatchClient,
  Tendermint34Client,
  Tendermint37Client,
  connectComet,
} from '@cosmjs/tendermint-rpc'

import { ConfigManager } from '@/config'

let stargateClient: StargateClient | undefined
let lastRpc: string | undefined

export const getStargateClient = async () => {
  if (!stargateClient) {
    lastRpc = ConfigManager.load().rpc
    if (!lastRpc) {
      throw new Error('RPC not configured')
    }

    stargateClient = await StargateClient.connect(lastRpc)

    // Update the stargate client when the config changes.
    ConfigManager.instance.onChange(async (config) => {
      if (config.rpc !== lastRpc) {
        // Reset the stargate client if the RPC changes.
        lastRpc = config.rpc
        stargateClient = undefined

        // Attempt to reconnect if the RPC is still configured. If this fails,
        // it should remain unset since it is no longer configured.
        if (config.rpc) {
          stargateClient = await StargateClient.connect(config.rpc)
        }
      }
    })
  }

  return stargateClient
}

// Create CosmWasm client that batches requests.
export const getCosmWasmClient = async (
  rpc: string
): Promise<CosmWasmClient> => {
  const httpClient = new HttpBatchClient(rpc)
  const tmClient = await (
    (
      await connectComet(rpc)
    ).constructor as
      | typeof Tendermint34Client
      | typeof Tendermint37Client
      | typeof Comet38Client
  ).create(httpClient)
  // @ts-ignore
  return new CosmWasmClient(tmClient)
}
