import { Formula } from '../types'
import { Expiration } from './types'

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

export const minter: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get<string>(contractAddress, 'minter')

export const contractInfo: Formula<ContractInfo | undefined> = async ({
  contractAddress,
  get,
}) => await get<ContractInfo>(contractAddress, 'nft_info')

export const nftInfo: Formula<
  NftInfo | undefined,
  { tokenId: string }
> = async ({ contractAddress, get, args: { tokenId } }) => {
  const info = await get<TokenInfo>(contractAddress, 'tokens', tokenId)

  return (
    info && {
      token_uri: info.token_uri,
      extension: info.extension,
    }
  )
}

export const ownerOf: Formula<
  OwnerOfInfo | undefined,
  { tokenId: string }
> = async ({ contractAddress, get, args: { tokenId } }) => {
  const info = await get<TokenInfo>(contractAddress, 'tokens', tokenId)

  return (
    info && {
      owner: info.owner,
      approvals: info.approvals,
    }
  )
}

export const allNftInfo: Formula<
  { access: OwnerOfInfo; info: NftInfo } | undefined,
  { tokenId: string }
> = async (env) => {
  const access = await ownerOf(env)
  const info = await nftInfo(env)

  return (
    access &&
    info && {
      access,
      info,
    }
  )
}

export const allOperators: Formula<
  Approval[],
  { owner: string; limit?: string; startAfter?: string }
> = async (env) => {
  const {
    contractAddress,
    getMap,
    args: { owner, limit = '30', startAfter },
  } = env

  const operatorsMap =
    (await getMap<string, Expiration>(contractAddress, ['operators', owner])) ??
    {}

  const limitNum = Math.max(0, Math.min(Number(limit), 30))

  const approvals = Object.entries(operatorsMap)
    // Ascending by spender address.
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([address]) => !startAfter || address.localeCompare(startAfter) > 0)
    .slice(0, limitNum)

  return approvals.map(([spender, expires]) => ({
    spender,
    expires,
  }))
}

export const numTokens: Formula<string> = async ({ contractAddress, get }) =>
  (await get<string>(contractAddress, 'num_tokens')) || '0'

export const tokens: Formula<
  string[],
  { owner: string; limit?: string; startAfter?: string }
> = async (env) => {
  const {
    contractAddress,
    getMap,
    args: { owner, limit = '30', startAfter },
  } = env

  const tokensMap =
    (await getMap<string>(contractAddress, ['tokens__owner', owner])) ?? {}

  const limitNum = Math.max(0, Math.min(Number(limit), 30))

  const tokens = Object.keys(tokensMap)
    // Ascending by token ID.
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([tokenId]) => !startAfter || tokenId.localeCompare(startAfter) > 0)
    .slice(0, limitNum)

  return tokens
}

export const allTokens: Formula<
  string[],
  { limit?: string; startAfter?: string }
> = async (env) => {
  const {
    contractAddress,
    getMap,
    args: { limit = '30', startAfter },
  } = env

  const tokensMap = (await getMap<string>(contractAddress, 'tokens')) ?? {}

  const limitNum = Math.max(0, Math.min(Number(limit), 30))

  const tokens = Object.keys(tokensMap)
    // Ascending by token ID.
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([tokenId]) => !startAfter || tokenId.localeCompare(startAfter) > 0)
    .slice(0, limitNum)

  return tokens
}

export const approvalsForSpender: Formula<
  Approval[] | undefined,
  { tokenId: string; spender: string }
> = async ({ contractAddress, get, args: { tokenId, spender } }) => {
  const info = await get<TokenInfo>(contractAddress, 'tokens', tokenId)
  if (!info) {
    return undefined
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
}

export const approvals: Formula<
  Approval[] | undefined,
  { tokenId: string }
> = async ({ contractAddress, get, args: { tokenId } }) =>
  (await get<TokenInfo>(contractAddress, 'tokens', tokenId))?.approvals
