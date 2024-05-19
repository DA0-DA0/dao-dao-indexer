import { ContractFormula } from '@/core'
import { AuctionConfig, AuctionConfigResponse, AuctionStrategy } from './types'

export const auctionConfig: ContractFormula<AuctionConfigResponse | undefined> =
  {
    compute: async ({ contractAddress, get }) => {
      let config: AuctionConfig | undefined = await get(
        contractAddress,
        'auction_config'
      )
      let priceStrategy: AuctionStrategy | undefined = await get(
        contractAddress,
        'auction_strategy'
      )

      if (config && priceStrategy) {
        return {
          ...config,
          ...priceStrategy,
        }
      } else {
        return undefined
      }
    },
  }
