import { WalletFormula } from '../../types'

export const votes: WalletFormula = async ({
  walletAddress,
  getWhereValueMatches,
}) => {
  // Votes for dao-proposal-single and dao-proposal-multiple.
  const votes = await getWhereValueMatches([
    'ballots',
    { wildcard: true },
    walletAddress,
  ])

  return votes
}
