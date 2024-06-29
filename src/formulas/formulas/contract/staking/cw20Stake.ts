import { fromBech32 } from '@cosmjs/encoding'

import { ContractFormula } from '@/types'

import { makeSimpleContractFormula } from '../../utils'

export type StakerBalance = {
  address: string
  balance: string
}

export type StakedBalanceAtHeight = {
  balance: string
  height: number
}

export type TotalStakedAtHeight = {
  total: string
  height: number
}

export const config = makeSimpleContractFormula<any>({
  key: 'config',
})

export const stakedBalanceAtHeight: ContractFormula<
  StakedBalanceAtHeight,
  {
    address: string
    // Required when querying oraichain-cw20-staking contract directly.
    oraichainStakingToken?: string
  }
> = {
  filter: {
    codeIdsKeys: [
      'cw20-stake',
      'oraichain-cw20-staking',
      'oraichain-cw20-staking-proxy-snapshot',
    ],
  },
  compute: async (env) => {
    const {
      getTransformationMatch,
      args: { address },
      block,
    } = env
    if (!address) {
      throw new Error('missing `address`')
    }

    let contractAddress = env.contractAddress
    const keys = ['stakedBalance']
    if (
      await env.contractMatchesCodeIdKeys(
        contractAddress,
        'oraichain-cw20-staking-proxy-snapshot'
      )
    ) {
      const proxyConfig = await config.compute(env)
      if (!proxyConfig) {
        throw new Error('missing proxy config')
      }
      contractAddress = proxyConfig.staking_contract
      keys.push(proxyConfig.asset_key)
    } else if (
      await env.contractMatchesCodeIdKeys(
        contractAddress,
        'oraichain-cw20-staking'
      )
    ) {
      if (!env.args.oraichainStakingToken) {
        throw new Error('missing `oraichainStakingToken`')
      }
      keys.push(env.args.oraichainStakingToken)
    }

    keys.push(address)

    const balance =
      (
        await getTransformationMatch<string | undefined>(
          contractAddress,
          keys.join(':')
        )
      )?.value ?? '0'

    return {
      balance,
      height: Number(block.height),
    }
  },
}

export const stakedBalance: ContractFormula<
  string,
  {
    address: string
    // Required when querying oraichain-cw20-staking contract directly.
    oraichainStakingToken?: string
  }
> = {
  filter: stakedBalanceAtHeight.filter,
  compute: async (env) => (await stakedBalanceAtHeight.compute(env)).balance,
}

export const totalStakedAtHeight: ContractFormula<
  TotalStakedAtHeight,
  {
    // Required when querying oraichain-cw20-staking contract directly.
    oraichainStakingToken?: string
  }
> = {
  filter: {
    codeIdsKeys: [
      'cw20-stake',
      'oraichain-cw20-staking',
      'oraichain-cw20-staking-proxy-snapshot',
    ],
  },
  compute: async (env) => {
    let contractAddress = env.contractAddress
    const keys: (string | Uint8Array)[] = ['total_staked']
    if (
      await env.contractMatchesCodeIdKeys(
        contractAddress,
        'oraichain-cw20-staking-proxy-snapshot'
      )
    ) {
      const proxyConfig = await config.compute(env)
      if (!proxyConfig) {
        throw new Error('missing proxy config')
      }
      contractAddress = proxyConfig.staking_contract
      keys.push(fromBech32(proxyConfig.asset_key).data)
    } else if (
      await env.contractMatchesCodeIdKeys(
        contractAddress,
        'oraichain-cw20-staking'
      )
    ) {
      if (!env.args.oraichainStakingToken) {
        throw new Error('missing `oraichainStakingToken`')
      }
      keys.push(fromBech32(env.args.oraichainStakingToken).data)
    }

    const total = (await env.get<string>(contractAddress, ...keys)) || '0'

    return {
      total,
      height: Number(env.block.height),
    }
  },
}

export const totalStaked: ContractFormula<
  string,
  {
    // Required when querying oraichain-cw20-staking contract directly.
    oraichainStakingToken?: string
  }
> = {
  filter: totalStakedAtHeight.filter,
  compute: async (env) => (await totalStakedAtHeight.compute(env)).total,
}

export const stakedValue: ContractFormula<string, { address: string }> = {
  filter: {
    codeIdsKeys: ['cw20-stake'],
  },
  compute: async (env) => {
    if (!env.args.address) {
      throw new Error('missing `address`')
    }

    const balance = Number(await totalValue.compute(env))
    const staked = Number(await stakedBalance.compute(env))
    const total = Number(
      await totalStaked.compute({
        ...env,
        args: {},
      })
    )

    if (balance === 0 || staked === 0 || total === 0) {
      return '0'
    }

    return total === 0 ? '0' : Math.floor((staked * balance) / total).toString()
  },
}

export const totalValue = makeSimpleContractFormula<string>({
  key: 'balance',
  fallback: '0',
})

export const claims: ContractFormula<any[], { address: string }> = {
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return (await get<any[]>(contractAddress, 'claims', address)) ?? []
  },
}

export const listStakers: ContractFormula<
  StakerBalance[],
  {
    limit?: string
    startAfter?: string
  }
> = {
  compute: async ({ contractAddress, getMap, args: { limit, startAfter } }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const stakers =
      (await getMap<string, string>(contractAddress, 'staked_balances')) ?? {}
    const stakes = Object.entries(stakers)
      // Ascending by address.
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(
        ([address]) => !startAfter || address.localeCompare(startAfter) > 0
      )
      .slice(0, limitNum)

    return stakes.map(([address, balance]) => ({
      address,
      balance,
    }))
  },
}

export const topStakers: ContractFormula<
  StakerBalance[],
  {
    limit?: string
    // Required when querying oraichain-cw20-staking contract directly.
    oraichainStakingToken?: string
  }
> = {
  filter: {
    codeIdsKeys: [
      'cw20-stake',
      'oraichain-cw20-staking',
      'oraichain-cw20-staking-proxy-snapshot',
    ],
  },
  compute: async (env) => {
    const {
      getTransformationMap,
      args: { limit },
    } = env

    let contractAddress = env.contractAddress
    const keys = ['stakedBalance']
    if (
      await env.contractMatchesCodeIdKeys(
        contractAddress,
        'oraichain-cw20-staking-proxy-snapshot'
      )
    ) {
      const proxyConfig = await config.compute(env)
      if (!proxyConfig) {
        throw new Error('missing proxy config')
      }
      contractAddress = proxyConfig.staking_contract
      keys.push(proxyConfig.asset_key)
    } else if (
      await env.contractMatchesCodeIdKeys(
        contractAddress,
        'oraichain-cw20-staking'
      )
    ) {
      if (!env.args.oraichainStakingToken) {
        throw new Error('missing `oraichainStakingToken`')
      }
      keys.push(env.args.oraichainStakingToken)
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const stakers =
      (await getTransformationMap<string, string>(
        contractAddress,
        keys.join(':')
      )) ?? {}
    const stakes = Object.entries(stakers)
      // Remove invalid addresses that end in colons (not sure how these appear,
      // probably the snapshot map internals) and zero balances.
      .filter(
        ([address, balance]) => !address.endsWith(':') && Number(balance) > 0
      )
      // Descending by balance.
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, limitNum)

    return stakes.map(([address, balance]) => ({
      address,
      balance,
    }))
  },
}
