import { fromBech32 } from '@cosmjs/encoding'

import { ContractFormula } from '@/types'

import { Expiration } from '../../types'
import { dao } from '../voting/daoVotingCw20Staked'

interface TokenInfo {
  name: string
  symbol: string
  decimals: number
  total_supply: string
}

interface TokenInfoResponse extends TokenInfo {
  mint?: {
    minter: string
    cap?: string
  }
}

interface AllowanceResponse {
  allowance: string
  expires: Expiration
}

interface OwnerAllowanceInfo extends AllowanceResponse {
  spender: string
}

interface SpenderAllowanceInfo extends AllowanceResponse {
  owner: string
}

interface AccountBalance {
  address: string
  balance: string
}

export const balance: ContractFormula<string, { address: string }> = {
  compute: async ({
    contractAddress,
    get,
    contractMatchesCodeIdKeys,
    args: { address },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    // cw20-base before v0.6.0-alpha3 stores addresses as raw bech32 data
    // instead of addr strings
    const isLegacy = await contractMatchesCodeIdKeys(
      contractAddress,
      'cw20-base-legacy'
    )
    const addressData = isLegacy ? fromBech32(address).data : address

    return (
      (await get<string>(contractAddress, 'balance', addressData)) ??
      // If no balance is found, return 0.
      '0'
    )
  },
}

export const tokenInfo: ContractFormula<TokenInfo | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) => {
    const tokenInfoResponse = (
      await getTransformationMatch<TokenInfoResponse>(
        contractAddress,
        'tokenInfo'
      )
    )?.value

    return (
      tokenInfoResponse && {
        ...tokenInfoResponse,
        // Not present in normal TokenInfoResponse.
        mint: undefined,
      }
    )
  },
}

export const minter: ContractFormula = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (
      await getTransformationMatch<TokenInfoResponse>(
        contractAddress,
        'tokenInfo'
      )
    )?.value?.mint,
}

export const allowance: ContractFormula<
  AllowanceResponse,
  { owner: string; spender: string }
> = {
  compute: async ({ contractAddress, get, args: { owner, spender } }) => {
    if (!owner) {
      throw new Error('missing `owner`')
    }
    if (!spender) {
      throw new Error('missing `spender`')
    }

    return (
      (await get<AllowanceResponse>(
        contractAddress,
        'allowance',
        owner,
        spender
      )) ?? {
        allowance: '0',
        expires: { never: {} },
      }
    )
  },
}

export const ownerAllowances: ContractFormula<
  OwnerAllowanceInfo[],
  {
    owner: string
    limit?: string
    startAfter?: string
  }
> = {
  compute: async ({
    contractAddress,
    getMap,
    args: { owner, limit, startAfter },
  }) => {
    if (!owner) {
      throw new Error('missing `owner`')
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const allowancesMap =
      (await getMap<string, AllowanceResponse>(contractAddress, [
        'allowance',
        owner,
      ])) ?? {}
    const allowances = Object.entries(allowancesMap)
      // Ascending by spender address.
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(
        ([address]) => !startAfter || address.localeCompare(startAfter) > 0
      )
      .slice(0, limitNum)

    return allowances.map(([spender, allowance]) => ({
      spender,
      ...allowance,
    }))
  },
}

export const spenderAllowances: ContractFormula<
  SpenderAllowanceInfo[],
  {
    spender: string
    limit?: string
    startAfter?: string
  }
> = {
  compute: async ({
    contractAddress,
    getMap,
    args: { spender, limit, startAfter },
  }) => {
    if (!spender) {
      throw new Error('missing `spender`')
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const allowancesMap =
      (await getMap<string, AllowanceResponse>(contractAddress, [
        'allowance_spender',
        spender,
      ])) ?? {}
    const allowances = Object.entries(allowancesMap)
      // Ascending by owner address.
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(
        ([address]) => !startAfter || address.localeCompare(startAfter) > 0
      )
      .slice(0, limitNum)

    return allowances.map(([owner, allowance]) => ({
      owner,
      ...allowance,
    }))
  },
}

export const allAccounts: ContractFormula<
  string[],
  {
    limit?: string
    startAfter?: string
  }
> = {
  compute: async ({ contractAddress, getMap, args: { limit, startAfter } }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const balancesMap = (await getMap<string>(contractAddress, 'balance')) ?? {}
    const accounts = Object.keys(balancesMap)
      // Ascending by address.
      .sort((a, b) => a.localeCompare(b))
      .filter((address) => !startAfter || address.localeCompare(startAfter) > 0)
      .slice(0, limitNum)

    return accounts
  },
}

export const topAccountBalances: ContractFormula<
  AccountBalance[],
  {
    limit?: string
  }
> = {
  compute: async ({ contractAddress, getMap, args: { limit } }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const balancesMap =
      (await getMap<string, string>(contractAddress, 'balance')) ?? {}
    const accounts = Object.entries(balancesMap)
      // Descending by balance.
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, limitNum)

    return accounts.map(([address, balance]) => ({
      address,
      balance,
    }))
  },
}

export const marketingInfo: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    (await get(contractAddress, 'marketing_info')) ?? {},
}

// Returns undefined if no logo URL found.
export const logoUrl: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) => {
    const logo = await get<{ url: string | never }>(contractAddress, 'logo')
    return logo && 'url' in logo ? logo.url : undefined
  },
}

// Get DAOs that use this cw20 as their governance token.
export const daos: ContractFormula<string[]> = {
  compute: async (env) => {
    const { contractAddress, getTransformationMatches, getCodeIdsForKeys } = env

    // Get dao-voting-cw20-staked contracts that use this token contract.
    const daoVotingCw20StakedContracts =
      (
        await getTransformationMatches(
          undefined,
          'token',
          contractAddress,
          getCodeIdsForKeys('dao-voting-cw20-staked')
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // Get the DAO for each voting contract.
    const daos = (
      await Promise.all(
        daoVotingCw20StakedContracts.map((contractAddress) =>
          dao.compute({
            ...env,
            contractAddress,
          })
        )
      )
    ).filter(Boolean) as string[]

    return daos
  },
}
