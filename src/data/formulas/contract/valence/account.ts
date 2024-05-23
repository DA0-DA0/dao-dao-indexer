import { Coin } from '@dao-dao/types/protobuf/codegen/cosmos/base/v1beta1/coin'
import { ContractFormula, dbKeyToKeys } from '@/core'
import { AccountResponse, AuctionIds, FundsInAuctionsResponse, Pair } from './types'
import { config as rebalancerConfig } from './rebalancer'
import { AUCTIONS_MANAGER_ADDR } from '.'

export const admin: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'admin'),
}

export const account: ContractFormula<AccountResponse | undefined> = {
  compute: async (env) => {
    let res: AccountResponse = {
      admin: undefined,
      rebalancerConfig: undefined,
    }

    ;(res.admin = await admin.compute(env)),
      (res.rebalancerConfig = await rebalancerConfig.compute(env))

    return res
  },
}

export const FundsInAuctions: ContractFormula<FundsInAuctionsResponse[] | undefined> = {
  compute: async ({ contractAddress: accountAddr, get, getMap }) => {
    // TODO: probably need to do something extra because our key is a pair and not a string
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
