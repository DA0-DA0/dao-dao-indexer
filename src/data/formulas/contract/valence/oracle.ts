import { map } from './../common'
import {
  ContractFormula,
  dbKeyForKeys,
  dbKeyToKeys,
  dbKeyToKeysAdvanced,
} from '@/core'
import { Pair, Price, PriceResponse } from './types'

// export const allPrices: ContractFormula<AllPricesResponse | undefined> =
//   {
//     compute: async ({ contractAddress, get }) => {
//       let config: AuctionConfig | undefined = await get(
//         contractAddress,
//         'auction_config'
//       )
//       let priceStrategy: AuctionStrategy | undefined = await get(
//         contractAddress,
//         'auction_strategy'
//       )

//       if (config && priceStrategy) {
//         return {
//           ...config,
//           ...priceStrategy,
//         }
//       } else {
//         return undefined
//       }
//     },
//   }

export const prices: ContractFormula<
  any[]| PriceResponse[] | PriceResponse | undefined,
  {
    base_denom?: string
    pair?: string
  }
> = {
  compute: async ({ contractAddress, get, getMap, args }) => {
    if (args.base_denom) {
      let pairs: any[] = []
      let pairMap = (await getMap(contractAddress, 'prices', {
        keyType: 'raw',
      }))![0]

      Object.keys(pairMap).forEach((element) => {
        let pair = dbKeyToKeys(element, [false, false])
        
        if (pair[1] == args.base_denom) {
        //   pairs.push({
        //     pair: [pair[0], pair[1]],
        //     price: pairMap[element].price,
        //     time: pairMap[element].time,
        //   })
        pairs.push(pair)
        }
      })

      return pairs
    } else if (args.pair) {
      let pair = args.pair.split(',') as Pair
      
      return get(contractAddress, 'prices', pair[0], pair[1]).then(
        (res: any) => {
          return {
            pair,
            price: res.price,
            time: res.time,
          }
        }
      )
    } else {
      throw new Error('Must include one of the arguments: pair | base_denom')
    }
  },
}
