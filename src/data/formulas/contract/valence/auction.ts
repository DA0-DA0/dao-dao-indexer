import { ContractFormula, dbKeyToKeys } from '@/core'

import { AUCTIONS_MANAGER_ADDR } from './constants'
import {
  AuctionConfig,
  AuctionConfigResponse,
  AuctionIds,
  AuctionStrategy,
  FundsInAuctionsResponse,
  Pair,
} from './types'

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

