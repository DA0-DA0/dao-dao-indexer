import { ContractFormula } from '../../../types'

export const config: ContractFormula = async ({ contractAddress, get }) =>
  await get(contractAddress, 'config')

export const dao: ContractFormula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'dao')

export const nftClaims: ContractFormula<any[], { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => (await get(contractAddress, 'nft_claims', address)) ?? []

export const votingPower: ContractFormula<
  string,
  { address: string }
> = async ({ contractAddress, get, args: { address } }) =>
  (await get<string>(contractAddress, 'nb', address)) || '0'

export const totalPower: ContractFormula<string> = async ({
  contractAddress,
  get,
}) => (await get<string>(contractAddress, 'tsn')) || '0'

export const stakedNfts: ContractFormula<
  any[],
  {
    address: string
    limit?: string
    startAfter?: string
  }
> = async ({
  contractAddress,
  getMap,
  args: { address, limit, startAfter },
}) => {
  const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

  const stakedNfts =
    (await getMap<string, any>(contractAddress, ['snpw', address])) ?? {}
  const tokenIds = Object.keys(stakedNfts)
    // Ascending by token ID.
    .sort((a, b) => a.localeCompare(b))
    .filter((voter) => !startAfter || voter.localeCompare(startAfter) > 0)
    .slice(0, limitNum)

  return tokenIds
}
