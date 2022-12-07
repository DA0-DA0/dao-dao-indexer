import { Formula } from '../../types'

export const config: Formula = async ({ contractAddress, get }) =>
  await get(contractAddress, 'config')

export const dao: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'dao')

export const nftClaims: Formula<any[], { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => (await get(contractAddress, 'nft_claims', address)) ?? []

export const votingPower: Formula<string, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => (await get<string>(contractAddress, 'nb', address)) || '0'

export const totalPower: Formula<string> = async ({ contractAddress, get }) =>
  (await get<string>(contractAddress, 'tsn')) || '0'

export const stakedNfts: Formula<
  any[],
  {
    address: string
    limit?: string
    startAfter?: string
  }
> = async (env) => {
  const {
    contractAddress,
    getMap,
    args: { address, limit = '10', startAfter },
  } = env

  const stakedNfts =
    (await getMap<string, any>(contractAddress, ['snpw', address])) ?? {}

  const limitNum = Math.max(0, Math.min(Number(limit), 10))

  const tokenIds = Object.keys(stakedNfts)
    // Ascending by token ID.
    .sort((a, b) => a.localeCompare(b))
    .filter((voter) => !startAfter || voter.localeCompare(startAfter) > 0)
    .slice(0, limitNum)

  return tokenIds
}
