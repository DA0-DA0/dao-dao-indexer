import { Coin } from '@dao-dao/types/protobuf/codegen/cosmos/base/v1beta1/coin'
import { ContractFormula } from '@/core'
import {
  AccountResponse,
  AuctionIds,
  ParsedTarget,
  RebalancerConfig,
  RebalancerConfigResponse,
} from './types'

const REBALANCER_ADDR =
  'neutron1qs6mzpmcw3dvg5l8nyywetcj326scszdj7v4pfk55xwshd4prqnqfwc0z2'
const AUCTIONS_MANAGER_ADDR =
  'neutron13exc5wdc7y5qpqazc34djnu934lqvfw2dru30j52ahhjep6jzx8ssjxcyz'

export const admin: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'admin'),
}

export const account: ContractFormula<AccountResponse | undefined> = {
  compute: async (env) => {
    let rebalancerConfigRes = await rebalancerConfig.compute(env)
    if (rebalancerConfigRes) {
      return {
        rebalancerConfig: rebalancerConfigRes,
      }
    } else {
      return undefined
    }
  },
}

export const rebalancerConfig: ContractFormula<
  RebalancerConfigResponse | undefined
> = {
  compute: async ({ contractAddress: accountAddr, get }) => {
    // TODO: modify to transformer
    let config: RebalancerConfig | undefined = await get(
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
      let config: RebalancerConfig | undefined = await get(
        accountAddr,
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
    let config: RebalancerConfig | undefined = await get(
      REBALANCER_ADDR,
      'configs',
      accountAddr
    )

    if (config) {
      return config.targets
    } else {
      return undefined
    }
  },
}

export const FundsInAuctions: ContractFormula<Coin[] | undefined> = {
  compute: async ({ contractAddress: accountAddr, get, getMap }) => {
    // TODO: probably need to do something extra because our key is a pair and not a string
    let pairs = await getMap(AUCTIONS_MANAGER_ADDR, 'pairs')

    if (!pairs) {
      throw new Error('No pairs found in auctions manager')
    }

    return Promise.all(
      Object.keys(pairs).map(async (pair) => {
        let auctionAddr = pairs[pair]

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
            amount: funds,
            denom: pair, // TODO: change to the first element of the pair
          }
        }

        return undefined
      })
    ).then((res) => res.filter((x) => x !== undefined) as Coin[])
  },
}
