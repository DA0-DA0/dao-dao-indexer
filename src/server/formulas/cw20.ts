import { Formula } from '../types'

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
  expires: any
}

interface OwnerAllowanceInfo extends AllowanceResponse {
  spender: string
}

interface SpenderAllowanceInfo extends AllowanceResponse {
  owner: string
}

export const balance: Formula<string, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) =>
  // If no balance is found, return 0.
  (await get<string>(contractAddress, 'balance', address)) ?? '0'

export const tokenInfo: Formula<TokenInfo | undefined> = async ({
  contractAddress,
  get,
}) => {
  const tokenInfoResponse = await get<TokenInfoResponse>(
    contractAddress,
    'token_info'
  )

  return (
    tokenInfoResponse && {
      ...tokenInfoResponse,
      // Not present in normal TokenInfoResponse.
      mint: undefined,
    }
  )
}

export const minter: Formula = async ({ contractAddress, get }) =>
  (await get<TokenInfoResponse>(contractAddress, 'token_info'))?.mint

export const allowance: Formula<
  AllowanceResponse | undefined,
  { owner: string; spender: string }
> = async ({ contractAddress, get, args: { owner, spender } }) =>
  await get<AllowanceResponse>(contractAddress, 'allowance', owner, spender)

export const ownerAllowances: Formula<
  OwnerAllowanceInfo[],
  {
    owner: string
    limit?: string
    startAfter?: string
  }
> = async (env) => {
  const {
    contractAddress,
    getMap,
    args: { owner, limit = '30', startAfter },
  } = env

  const allowancesMap =
    (await getMap<string, AllowanceResponse>(contractAddress, [
      'allowance',
      owner,
    ])) ?? {}

  const limitNum = Math.max(0, Math.min(Number(limit), 30))

  const allowances = Object.entries(allowancesMap)
    // Ascending by spender address.
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([address]) => !startAfter || address.localeCompare(startAfter) > 0)
    .slice(0, limitNum)

  return allowances.map(([spender, allowance]) => ({
    spender,
    ...allowance,
  }))
}

export const spenderAllowances: Formula<
  SpenderAllowanceInfo[],
  {
    spender: string
    limit?: string
    startAfter?: string
  }
> = async (env) => {
  const {
    contractAddress,
    getMap,
    args: { spender, limit = '30', startAfter },
  } = env

  const allowancesMap =
    (await getMap<string, AllowanceResponse>(contractAddress, [
      'allowance_spender',
      spender,
    ])) ?? {}

  const limitNum = Math.max(0, Math.min(Number(limit), 30))

  const allowances = Object.entries(allowancesMap)
    // Ascending by owner address.
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([address]) => !startAfter || address.localeCompare(startAfter) > 0)
    .slice(0, limitNum)

  return allowances.map(([owner, allowance]) => ({
    owner,
    ...allowance,
  }))
}

export const marketingInfo: Formula = async ({ contractAddress, get }) =>
  await get(contractAddress, 'marketing_info')

// Returns undefined if no logo URL found.
export const logoUrl: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => {
  const logo = await get<{ url: string | never }>(contractAddress, 'logo')
  return logo && 'url' in logo ? logo.url : undefined
}
