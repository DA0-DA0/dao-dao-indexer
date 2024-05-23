import { ContractFormula, dbKeyToKeys } from '@/core'
import { AuctionConfig, AuctionConfigResponse, AuctionIds, AuctionStrategy, FundsInAuctionsResponse, Pair } from './types'
import { AUCTIONS_MANAGER_ADDR } from '.'

export const config: ContractFormula<AuctionConfigResponse | undefined> =
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
          price_strategy: priceStrategy,
        }
      } else {
        return undefined
      }
    },
  }

export const accountFunds: ContractFormula<FundsInAuctionsResponse[] | undefined> = {
  compute: async ({ contractAddress: accountAddr, get, getMap }) => {
    let pairMap = (await getMap(AUCTIONS_MANAGER_ADDR, 'pairs', {
      keyType: 'raw',
    }))!

    return Promise.all(Object.entries(pairMap).map(async ([key, auctionAddr]) => {
      let pair = dbKeyToKeys(key, [false, false]) as Pair

      // get the current id of the auction
      let auctionCurrId = (
        (await get(auctionAddr, 'auction_ids')) as AuctionIds
      ).curr

      // get the funds amount
      let funds: string | undefined = await get(
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
    })).then((res) => {
      let filtered = res.filter(r => r !== undefined) as FundsInAuctionsResponse[];
      return (filtered.length > 0) ? filtered : undefined 
    })
  },
}
