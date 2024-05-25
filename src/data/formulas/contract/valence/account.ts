import { ContractFormula, dbKeyToKeys } from '@/core'

import { AUCTIONS_MANAGER_ADDR, REBALANCER_ADDR } from './constants'
import {
  AccountResponse,
  AuctionIds,
  FundsInAuctionsResponse,
  Pair,
  ParsedTarget,
  RebalancerConfig,
  RebalancerConfigResponse,
} from './types'

export const admin: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'admin'),
}

export const data: ContractFormula<AccountResponse | undefined> = {
  compute: async (env) => ({
    admin: await admin.compute(env),
    rebalancerConfig: await rebalancerConfig.compute(env),
  }),
}

export const rebalancerConfig: ContractFormula<
  RebalancerConfigResponse | undefined
> = {
  compute: async ({ contractAddress: accountAddr, get }) => {
    // TODO: modify to transformer
    const config: RebalancerConfig | undefined = await get(
      REBALANCER_ADDR,
      'configs',
      accountAddr
    )

    if (config) {
      return {
        ...config,
        is_paused: false,
      }
    } else {
      const config: RebalancerConfig | undefined = await get(
        REBALANCER_ADDR,
        'paused_configs',
        accountAddr
      )
      if (config) {
        return {
          ...config,
          is_paused: true,
        }
      } else {
        return undefined
      }
    }
  },
}

export const rebalancerTargets: ContractFormula<ParsedTarget[] | undefined> = {
  compute: async ({ contractAddress: accountAddr, get }) => {
    // TODO: modify to transformer
    const config: RebalancerConfig | undefined = await get(
      REBALANCER_ADDR,
      'configs',
      accountAddr
    )

    return config?.targets
  },
}

export const fundsInAuction: ContractFormula<
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
