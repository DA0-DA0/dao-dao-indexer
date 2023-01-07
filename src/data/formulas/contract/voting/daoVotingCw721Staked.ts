import { ContractFormula } from '@/core'

export const config: ContractFormula = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'config'),
}

export const dao: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) =>
    await get(contractAddress, 'dao'),
}

export const nftClaims: ContractFormula<any[], { address: string }> = {
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return (await get(contractAddress, 'nft_claims', address)) ?? []
  },
}

export const votingPower: ContractFormula<string, { address: string }> = {
  compute: async ({ contractAddress, get, args: { address } }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    return (await get<string>(contractAddress, 'nb', address)) || '0'
  },
}

export const totalPower: ContractFormula<string> = {
  compute: async ({ contractAddress, get }) =>
    (await get<string>(contractAddress, 'tsn')) || '0',
}

export const stakedNfts: ContractFormula<
  any[],
  {
    address: string
    limit?: string
    startAfter?: string
  }
> = {
  compute: async ({
    contractAddress,
    getMap,
    args: { address, limit, startAfter },
  }) => {
    if (!address) {
      throw new Error('missing `address`')
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const stakedNfts =
      (await getMap<string, any>(contractAddress, ['snpw', address])) ?? {}
    const tokenIds = Object.keys(stakedNfts)
      // Ascending by token ID.
      .sort((a, b) => a.localeCompare(b))
      .filter((voter) => !startAfter || voter.localeCompare(startAfter) > 0)
      .slice(0, limitNum)

    return tokenIds
  },
}
