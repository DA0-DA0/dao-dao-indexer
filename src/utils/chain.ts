import { StargateClient } from '@cosmjs/stargate'

import { loadConfig } from '@/config'

let stargateClient: StargateClient | undefined
export const getStargateClient = async () => {
  if (!stargateClient) {
    const { rpc } = loadConfig()
    stargateClient = await StargateClient.connect(rpc)
  }

  return stargateClient
}
