import { ContractFormula } from '@/types'

import { Expiration } from '../../types'
import { makeSimpleContractFormula } from '../../utils'

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

export const minter = makeSimpleContractFormula<string>({
  docs: {
    description: 'retrieves the minter address for the NFT contract',
  },
  transformation: 'minter',
})

export const contractInfo = makeSimpleContractFormula<ContractInfo>({
  docs: {
    description: 'retrieves the contract info for the NFT contract',
  },
  transformation: 'nftInfo',
})

export const nftInfo: ContractFormula<NftInfo, { tokenId: string }> = {
  docs: {
    description: 'retrieves the NFT info for a specific token ID',
    args: [
      {
        name: 'tokenId',
        description: 'ID of the token to retrieve info for',
        required: true,
      },
    ],
  },
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

    if (!info) {
      throw new Error('token ID not found')
    }

    return {
      token_uri: info.token_uri,
      extension: info.extension,
    }
  },
}

export const ownerOf: ContractFormula<OwnerOfInfo, { tokenId: string }> = {
  docs: {
    description: 'retrieves the owner and approvals for a specific token ID',
    args: [
      {
        name: 'tokenId',
        description: 'ID of the token to retrieve owner info for',
        required: true,
      },
    ],
  },
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

    if (!info) {
      throw new Error('token ID not found')
    }

    return {
      owner: info.owner,
      approvals: info.approvals,
    }
  },
}

export const allNftInfo: ContractFormula<
  { access: OwnerOfInfo; info: NftInfo },
  { tokenId: string }
> = {
  docs: {
    description:
      'retrieves both NFT info and owner info for a specific token ID',
    args: [
      {
        name: 'tokenId',
        description: 'ID of the token to retrieve all info for',
        required: true,
      },
    ],
  },
  compute: async (env) => {
    const access = await ownerOf.compute(env)
    const info = await nftInfo.compute(env)

    if (!access || !info) {
      throw new Error('token ID not found')
    }

    return {
      access,
      info,
    }
  },
}

export const allOperators: ContractFormula<
  Approval[],
  { owner: string; limit?: string; startAfter?: string }
> = {
  docs: {
    description: 'retrieves all operators for a specific owner',
    args: [
      {
        name: 'owner',
        description: 'address of the owner to retrieve operators for',
        required: true,
      },
      {
        name: 'limit',
        description: 'maximum number of operators to return',
        required: false,
      },
      {
        name: 'startAfter',
        description: 'operator address to start listing after',
        required: false,
      },
    ],
  },
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
  docs: {
    description: 'retrieves the total number of tokens in the NFT contract',
  },
  compute: async ({ contractAddress, getTransformationMatch }) =>
    (await getTransformationMatch<number>(contractAddress, 'numTokens'))
      ?.value ?? 0,
}

export const tokens: ContractFormula<
  string[],
  { owner: string; limit?: string; startAfter?: string }
> = {
  docs: {
    description: 'retrieves all tokens owned by a specific address',
    args: [
      {
        name: 'owner',
        description: 'address of the owner to retrieve tokens for',
        required: true,
      },
      {
        name: 'limit',
        description: 'maximum number of tokens to return',
        required: false,
      },
      {
        name: 'startAfter',
        description: 'token ID to start listing after',
        required: false,
      },
    ],
  },
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
  docs: {
    description: 'retrieves all tokens in the NFT contract',
    args: [
      {
        name: 'limit',
        description: 'maximum number of tokens to return',
        required: false,
      },
      {
        name: 'startAfter',
        description: 'token ID to start listing after',
        required: false,
      },
    ],
  },
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
  Approval[],
  { tokenId: string; spender: string }
> = {
  docs: {
    description: 'retrieves approvals for a specific spender on a token',
    args: [
      {
        name: 'tokenId',
        description: 'ID of the token to check approvals for',
        required: true,
      },
      {
        name: 'spender',
        description: 'address of the spender to check approvals for',
        required: true,
      },
    ],
  },
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
      throw new Error('token ID not found')
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

export const approvals: ContractFormula<Approval[], { tokenId: string }> = {
  docs: {
    description: 'retrieves all approvals for a specific token',
    args: [
      {
        name: 'tokenId',
        description: 'ID of the token to retrieve approvals for',
        required: true,
      },
    ],
  },
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

    if (!info) {
      throw new Error('token ID not found')
    }

    return info.approvals
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
