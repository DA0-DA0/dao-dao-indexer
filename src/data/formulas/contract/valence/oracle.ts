import { ContractFormula, dbKeyToKeys } from '@/core'

import { Pair, Price, PriceResponse } from './types'

export const allPrices: ContractFormula<PriceResponse[] | undefined> = {
  compute: async ({ contractAddress, getMap }) => {
    const pairMap = (await getMap(contractAddress, 'prices', {
      keyType: 'raw',
    }))!

    return Object.entries(pairMap).map(([key, value]) => {
      const pair = dbKeyToKeys(key, [false, false]) as Pair

      return {
        pair,
        ...value,
      }
    })
  },
}

export const price: ContractFormula<
  PriceResponse | undefined,
  { pair: string }
> = {
  compute: async ({ contractAddress, get, args }) => {
    if (!args.pair) {
      throw new Error('Must include the pair argument')
    }

    const pair = args.pair.split(',') as Pair
    const priceAndTime = await get<Price>(
      contractAddress,
      'prices',
      pair[0],
      pair[1]
    )

    return (
      priceAndTime && {
        pair,
        price: priceAndTime.price,
        time: priceAndTime.time,
      }
    )
  },
}

export const pricesOfDenom: ContractFormula<
  PriceResponse[] | undefined,
  {
    base_denom: string
  }
> = {
  compute: async ({ contractAddress, getMap, args }) => {
    if (!args.base_denom) {
      throw new Error('Must include the pair argument')
    }

    const pairs: PriceResponse[] = []
    const pairMap =
      (await getMap(contractAddress, 'prices', {
        keyType: 'raw',
      })) || {}

    Object.entries(pairMap).forEach(([key, value]) => {
      const pair = dbKeyToKeys(key, [false, false]) as Pair

      if (pair[1] === args.base_denom) {
        pairs.push({
          pair,
          ...value,
        })
      }
    })

    return pairs
  },
}
