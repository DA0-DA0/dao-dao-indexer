import { StargateClient } from '@cosmjs/stargate'
import axios from 'axios'

import { ContractEnv, ContractFormula } from '@/core'
import { loadConfig } from '@/core/config'

import { tokenInfo } from '../external/cw20'
import { getUniqueSubDaosInTree } from './utils'

// TVL in USD.
export const tvl: ContractFormula<
  number,
  {
    // Whether or not to recurse into SubDAOs. Defaults to true. `true` or `1`
    // means recurse, anything else means don't recurse.
    recursive?: string
  }
> = {
  // Depends on current prices.
  dynamic: true,
  compute: async (env) => {
    let totalTvl = 0

    // Compute TVL of unstaked and staked native balances.
    const stargateClient = await getStargateClient()

    totalTvl += (
      await Promise.all(
        (
          await stargateClient.getAllBalances(env.contractAddress)
        ).map(({ denom, amount }) =>
          getTokenUsdPrice(env, 'native', denom, Number(amount))
        )
      )
    ).reduce((acc, price) => acc + price, 0)

    const staked = await stargateClient.getBalanceStaked(env.contractAddress)
    totalTvl += staked
      ? await getTokenUsdPrice(
          env,
          'native',
          staked.denom,
          Number(staked.amount)
        )
      : 0

    // const cw20s = await cw20Balances.compute({
    //   ...env,
    //   walletAddress: env.contractAddress,
    // })
    // totalTvl += (
    //   await Promise.all(
    //     cw20s.map(({ contractAddress, balance }) =>
    //       getTokenUsdPrice(env, 'cw20', contractAddress, Number(balance))
    //     )
    //   )
    // ).reduce((acc, price) => acc + price, 0)

    // Add TVL from SubDAOs if `recursive` is enabled.
    if (
      !('recursive' in env.args) ||
      env.args.recursive === 'true' ||
      env.args.recursive === '1'
    ) {
      const subDaos = await getUniqueSubDaosInTree(env, env.contractAddress)

      for (const subDao of subDaos) {
        totalTvl += await tvl.compute({
          ...env,
          contractAddress: subDao,
          // Already recursed and got all SubDAOs in tree.
          args: {
            recursive: 'false',
          },
        })
      }
    }

    return totalTvl
  },
}

type WyndPrice = {
  asset: string
  priceInEur: number
  priceInUsd: number
}

// Number of decimals to list of denoms that use that number of decimals.
const denomDecimals = Object.entries({
  6: [
    'ujuno',

    // Taken from
    // https://github.com/CosmosContracts/junoswap-asset-list/blob/main/ibc_assets.json.
    // All current IBC tokens use 6 decimal places.

    // ATOM
    'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9',
    // OSMO
    'ibc/ED07A3391A112B175915CD8FAF43A2DA8E4790EDE12566649D0C2F97716B8518',
    // STARS
    'ibc/F6B367385300865F654E110976B838502504231705BAC0849B0651C226385885',
    // AKT
    'ibc/DFC6F33796D5D0075C5FB54A4D7B8E76915ACF434CB1EE2A1BA0BB8334E17C3A',
    // SCRT
    'ibc/B55B08EF3667B0C6F029C2CC9CAA6B00788CF639EBB84B34818C85CBABA33ABD',
    // USDC
    'ibc/EAC38D55372F38F1AFD68DF7FE9EF762DCF69F26520643CF3F9D292A738D8034',

    // 'ibc/8F865D9760B482FF6254EDFEC1FF2F1273B9AB6873A7DE484F89639795D73D75',
    // 'ibc/2DA4136457810BCB9DAAB620CA67BC342B17C3C70151CA70490A170DF7C9CB27',
    // 'ibc/008BFD000A10BCE5F0D4DD819AE1C1EC2942396062DABDD6AE64A655ABC7085B',
    // 'ibc/D836B191CDAE8EDACDEBE7B64B504C5E06CC17C6A072DAF278F9A96DF66F6241',
    // 'ibc/7455B3F2F2737906BACF4AE980069A4CAB7C7F9FDAABAEFBA439DF037AEC5898',
    // 'ibc/946AD96F278770521526D7283F58268DA2F6ACDDE40324A9D1C86811D78C86A0',
    // 'ibc/6842C591DC4588411A565C9FF650FB15A17DFE3F0A43201E8141E4D14B8D171A',
    // 'ibc/0CB5D60E57FD521FA39D11E3E410144389010AC5EF5F292BC9BDD832FA2FDBF9',
    // 'ibc/52423136339C1CE8C91F6A586DFE41591BDDD4665AE526DFFA8421F9ACF95196',
    // 'ibc/B9F7C1E4CE9219B5AF06C47B18661DBD49CCD7A6C18FF789E2FB62BB365CFF9C',
    // 'ibc/5CB906E82B7A88E62644AD811361F5858B74BA9EBD75C84B6D24B20C01A4819F',
    // 'ibc/436B576861090C1C921D56BA1FAE481A04D2E938EBDFF55C4712670F9754AC40',
  ],
})
  // Convert to map from denom to number of decimals.
  .reduce((acc, [decimals, denoms]) => {
    denoms.forEach((denom) => {
      acc[denom] = Number(decimals)
    })
    return acc
  }, {} as Record<string, number | undefined>)

const cachedCw20Decimals = new Map<string, number>()
const getCw20Decimals = async (env: ContractEnv, address: string) => {
  if (cachedCw20Decimals.has(address)) {
    return cachedCw20Decimals.get(address)!
  }

  const info = await tokenInfo.compute({
    ...env,
    contractAddress: address,
  })
  if (!info) {
    throw new Error(`No token info for ${address}`)
  }

  cachedCw20Decimals.set(address, info.decimals)
  return info.decimals
}

let prices: WyndPrice[] | undefined
const getTokenUsdPrice = async (
  env: ContractEnv,
  type: 'native' | 'cw20',
  denomOrAddress: string,
  // Amount without decimals.
  microAmount: number
) => {
  if (!prices) {
    prices = (
      await axios.get<WyndPrice[]>('https://api.wynddao.com/assets/prices')
    ).data
  }

  if (type === 'native') {
    const price = prices.find((price) => price.asset === denomOrAddress)
    if (!price) {
      return 0
    }

    const decimals = denomDecimals[denomOrAddress]
    if (decimals === undefined) {
      return 0
      // throw new Error(`Unknown denom: ${denomOrAddress}`)
    }

    return (microAmount / Math.pow(10, decimals)) * price.priceInUsd
  } else if (type === 'cw20') {
    const price = prices.find((price) => price.asset === denomOrAddress)
    if (!price) {
      return 0
    }

    denomDecimals[denomOrAddress] ??= await getCw20Decimals(env, denomOrAddress)

    return (
      (microAmount / Math.pow(10, denomDecimals[denomOrAddress]!)) *
      price.priceInUsd
    )
  }

  return 0
}

let stargateClient: StargateClient | undefined
const getStargateClient = async () => {
  if (!stargateClient) {
    const { rpc } = loadConfig()
    stargateClient = await StargateClient.connect(rpc)
  }

  return stargateClient
}
