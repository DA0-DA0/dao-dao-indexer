import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import { StargateClient } from '@cosmjs/stargate'
import {
  Comet38Client,
  HttpBatchClient,
  Tendermint34Client,
  Tendermint37Client,
  connectComet,
} from '@cosmjs/tendermint-rpc'

import { loadConfig } from '@/config'

let stargateClient: StargateClient | undefined
export const getStargateClient = async () => {
  if (!stargateClient) {
    const { rpc } = loadConfig()
    stargateClient = await StargateClient.connect(rpc)
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
