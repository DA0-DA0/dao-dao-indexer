import { WalletFormula } from '../../types'
import { dbKeyForKeys, dbKeyToNumber } from '../../utils'

export const votes: WalletFormula = async ({
  walletAddress,
  getWhereValueMatches,
}) => {
  // Votes for dao-proposal-single and dao-proposal-multiple.
  const voteEvents = await getWhereValueMatches([
    'ballots',
    { wildcard: true },
    walletAddress,
  ])

  // Remove ballots prefix, ID length prefix bytes, and address suffix keys to
  // extract ID where wildcard is.
  const ballotsKey = dbKeyForKeys('ballots', '') + ',0,8,'
  const addressKey = ',' + dbKeyForKeys(walletAddress)

  const votes = voteEvents?.map(({ contractAddress, block, key, value }) => ({
    proposalModule: contractAddress,
    proposalId: dbKeyToNumber(key.match(ballotsKey + '(.*)' + addressKey)![1]),
    vote: value,
    votedAt: new Date(block.timeUnixMs).toISOString(),
  }))

  return votes
}
