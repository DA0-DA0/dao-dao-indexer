import { ContractFormula } from '@/core'

import { Expiration } from '../../../types'

interface ContractInfo {
  name: string
  symbol: string
}

interface Approval {
  spender: string
  expires: Expiration
}

interface TokenInfo {
  owner: string
  approvals: Approval[]
  token_uri?: string
  extension: any
}

type NftInfo = Pick<TokenInfo, 'token_uri' | 'extension'>
type OwnerOfInfo = Pick<TokenInfo, 'owner' | 'approvals'>

export const minter: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<string>(contractAddress, 'minter'))?.value,
}

export const contractInfo: ContractFormula<ContractInfo | undefined> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<ContractInfo>(contractAddress, 'nftInfo'))
      ?.value,
}

export const nftInfo: ContractFormula<
  NftInfo | undefined,
  { tokenId: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { tokenId },
  }) => {
    if (!tokenId) {
      throw new Error('missing `tokenId`')
    }

    const info = (
      await getTransformationMatch<TokenInfo>(
        contractAddress,
        `token:${tokenId}`
      )
    )?.value

    return (
      info && {
        token_uri: info.token_uri,
        extension: info.extension,
      }
    )
  },
}

export const ownerOf: ContractFormula<
  OwnerOfInfo | undefined,
  { tokenId: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { tokenId },
  }) => {
    if (!tokenId) {
      throw new Error('missing `tokenId`')
    }

    const info = (
      await getTransformationMatch<TokenInfo>(
        contractAddress,
        `token:${tokenId}`
      )
    )?.value

    return (
      info && {
        owner: info.owner,
        approvals: info.approvals,
      }
    )
  },
}

export const allNftInfo: ContractFormula<
  { access: OwnerOfInfo; info: NftInfo } | undefined,
  { tokenId: string }
> = {
  compute: async (env) => {
    const access = await ownerOf.compute(env)
    const info = await nftInfo.compute(env)

    return (
      access &&
      info && {
        access,
        info,
      }
    )
  },
}

export const allOperators: ContractFormula<
  Approval[],
  { owner: string; limit?: string; startAfter?: string }
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

    const operatorsMap =
      (await getMap<string, Expiration>(contractAddress, [
        'operators',
        owner,
      ])) ?? {}
    const approvals = Object.entries(operatorsMap)
      // Ascending by spender address.
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(
        ([address]) => !startAfter || address.localeCompare(startAfter) > 0
      )
      .slice(0, limitNum)

    return approvals.map(([spender, expires]) => ({
      spender,
      expires,
    }))
  },
}

export const numTokens: ContractFormula<number> = {
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<number>(contractAddress, 'numTokens'))
      ?.value ?? 0,
}

export const tokens: ContractFormula<
  string[],
  { owner: string; limit?: string; startAfter?: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMap,
    args: { owner, limit, startAfter },
  }) => {
    if (!owner) {
      throw new Error('missing `owner`')
    }

    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const tokensMap =
      (await getTransformationMap<string>(
        contractAddress,
        `tokenOwner:${owner}`
      )) ?? {}
    const tokens = Object.keys(tokensMap)
      .map(decodeTokenId)
      // Ascending by token ID.
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(
        ([tokenId]) => !startAfter || tokenId.localeCompare(startAfter) > 0
      )
      .slice(0, limitNum)

    return tokens
  },
}

export const allTokens: ContractFormula<
  string[],
  { limit?: string; startAfter?: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMap,
    args: { limit, startAfter },
  }) => {
    const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

    const tokensMap =
      (await getTransformationMap<string>(contractAddress, 'token')) ?? {}
    const tokens = Object.keys(tokensMap)
      .map(decodeTokenId)
      // Ascending by token ID.
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(
        ([tokenId]) => !startAfter || tokenId.localeCompare(startAfter) > 0
      )
      .slice(0, limitNum)

    return tokens
  },
}

export const approvalsForSpender: ContractFormula<
  Approval[] | undefined,
  { tokenId: string; spender: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { tokenId, spender },
  }) => {
    if (!tokenId) {
      throw new Error('missing `tokenId`')
    }
    if (!spender) {
      throw new Error('missing `spender`')
    }

    const info = (
      await getTransformationMatch<TokenInfo>(
        contractAddress,
        `token:${tokenId}`
      )
    )?.value
    if (!info) {
      return
    }

    if (info.owner === spender) {
      return [
        {
          spender: info.owner,
          expires: { never: {} },
        },
      ]
    }

    const spenderApprovals = info.approvals.filter(
      (approval) => approval.spender === spender
    )

    return spenderApprovals
  },
}

export const approvals: ContractFormula<
  Approval[] | undefined,
  { tokenId: string }
> = {
  compute: async ({
    contractAddress,
    getTransformationMatch,
    args: { tokenId },
  }) => {
    if (!tokenId) {
      throw new Error('missing `tokenId`')
    }

    const info = (
      await getTransformationMatch<TokenInfo>(
        contractAddress,
        `token:${tokenId}`
      )
    )?.value

    return info?.approvals
  },
}

// Helpers

// Some NFT contracts store token IDs as numbers, even though the cw721-base
// contract stores them as strings. This function attempts to detect when a
// string actually a utf-8 encoded number and turn it into the proper string
// representation of a number.
const decodeTokenId = (tokenId: string): string => {
  // Replace escaped null bytes with a single backslash to get the unescaped
  // bytes.
  const unescaped = tokenId.replace(/\\0/g, '\0')
  // If the unescaped token ID is 8 bytes long and starts with a null byte or
  // all bytes are 0xFF, it is a utf-8 encoded number. Only the largest Uint64
  // number won't start with a null byte, and it'll only consist of 0xFF bytes.
  if (
    unescaped.length === 8 &&
    (unescaped[0] === '\0' || unescaped === '\xFF'.repeat(8))
  ) {
    const buffer = Buffer.from(unescaped, 'utf-8')
    const number = buffer.readBigUint64BE()
    return number.toString()
  }

  return tokenId
}
