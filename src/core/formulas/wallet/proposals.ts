import { WalletFormula } from '../../types'
import { dbKeyForKeys, dbKeyToNumber } from '../../utils'

export const created: WalletFormula<
  {
    proposalModule: string
    proposalId: number
  }[]
> = async ({ walletAddress, getWhereValueMatches }) => {
  // Proposals for v1 dao-proposal-single and v2 dao-proposal-multiple.
  const createdProposalV1Events = await getWhereValueMatches(
    ['proposals', { wildcard: true }],
    {
      proposer: walletAddress,
    }
  )
  // Proposals for v2 dao-proposal-single.
  const createdProposalV2Events = await getWhereValueMatches(
    ['proposals_v2', { wildcard: true }],
    {
      proposer: walletAddress,
    }
  )

  // Remove proposals prefix to extract ID where wildcard is.
  const proposalsV1Key = dbKeyForKeys('proposals', '') + ','
  const proposalsV2Key = dbKeyForKeys('proposals_v2', '') + ','

  const proposalsCreated = [
    ...(createdProposalV1Events ?? []),
    ...(createdProposalV2Events ?? []),
  ].map(({ contractAddress, key }) => ({
    proposalModule: contractAddress,
    proposalId: dbKeyToNumber(
      key.match(`(?:${proposalsV1Key}|${proposalsV2Key})` + '(.*)')![1]
    ),
  }))

  return proposalsCreated
}

export const votesCast: WalletFormula<
  | {
      proposalModule: string
      proposalId: number
      vote: any
      votedAt: string
    }[]
  | undefined
> = async ({ walletAddress, getWhereValueMatches }) => {
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

export const stats: WalletFormula<{
  created: number
  votesCast: number
}> = async (env) => ({
  created: (await created(env)).length ?? 0,
  votesCast: (await votesCast(env))?.length ?? 0,
})
