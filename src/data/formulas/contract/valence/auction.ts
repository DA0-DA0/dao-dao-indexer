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

export const accountFunds: ContractFormula<
  FundsInAuctionsResponse[] | undefined
> = {
  compute: async ({ contractAddress: accountAddr, get, getMap }) => {
    const pairMap = (await getMap(AUCTIONS_MANAGER_ADDR, 'pairs', {
      keyType: 'raw',
    }))!

    return Promise.all(
      Object.entries(pairMap).map(async ([key, auctionAddr]) => {
        const pair = dbKeyToKeys(key, [false, false]) as Pair

        // get the current id of the auction
        const auctionCurrId = (
          (await get(auctionAddr, 'auction_ids')) as AuctionIds
        ).curr

        // get the funds amount
        const funds: string | undefined = await get(
          auctionAddr,
          'funds',
          auctionCurrId,
          accountAddr
        )

        if (funds) {
          return {
            pair,
            amount: funds,
          } as FundsInAuctionsResponse
        }

        return undefined
      })
    ).then((res) => {
      const filtered = res.filter(
        (r) => r !== undefined
      ) as FundsInAuctionsResponse[]
      return filtered.length > 0 ? filtered : undefined
    })
  },
}
