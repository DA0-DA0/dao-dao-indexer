import { map } from './../common'
import {
  ContractFormula,
  dbKeyToKeys,
} from '@/core'
import { Pair, Price, PriceResponse } from './types'

export const allPrices: ContractFormula<PriceResponse[] | undefined> = {
  compute: async ({ contractAddress, getMap }) => {
    let pairMap = (await getMap(contractAddress, 'prices', {
      keyType: 'raw',
    }))!

    return Object.entries(pairMap).map(([key, value]) => {
      let pair = dbKeyToKeys(key, [false, false]) as Pair

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

    let pair = args.pair.split(',') as Pair

    return get(contractAddress, 'prices', pair[0], pair[1]).then((res: any) => {
      return {
        pair,
        price: res.price,
        time: res.time,
      }
    })
  },
}

export const pricesOfDenom: ContractFormula<
  PriceResponse[] | undefined,
  {
    base_denom: string
  }
> = {
  compute: async ({ contractAddress, get, getMap, args }) => {
    if (!args.base_denom) {
      throw new Error('Must include the pair argument')
    }

    let pairs: PriceResponse[] = []
    let pairMap = (await getMap(contractAddress, 'prices', {
      keyType: 'raw',
    }))!

    Object.entries(pairMap).forEach(([key, value]) => {
      let pair = dbKeyToKeys(key, [false, false]) as Pair

      if (pair[1] == args.base_denom) {
        pairs.push({
          pair,
          ...value,
        })
      }
    })

    return pairs
  },
}
