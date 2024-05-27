import { ContractFormula } from '@/core'

import { AuctionConfig, AuctionConfigResponse, AuctionStrategy } from './types'

export const config: ContractFormula<AuctionConfigResponse | undefined> = {
  compute: async ({ contractAddress, get }) => {
    const config: AuctionConfig | undefined = await get(
      contractAddress,
      'auction_config'
    )
    const priceStrategy: AuctionStrategy | undefined = await get(
      contractAddress,
      'auction_strategy'
    )

    if (config && priceStrategy) {
      return {
        ...config,
        price_strategy: priceStrategy,
      }
    } else {
      return undefined
    }
  },
}
