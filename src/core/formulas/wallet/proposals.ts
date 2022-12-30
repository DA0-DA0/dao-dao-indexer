import { WalletFormula } from '../../types'

export const created: WalletFormula<
  | {
      proposalModule: string
      proposalId: number
    }[]
  | undefined
> = async ({ walletAddress, getTransformMatches }) => {
  // Proposals for v1/v2 dao-proposal-single and v2 dao-proposal-multiple.
  const proposedTransformations = await getTransformMatches<{
    proposalId: number
  }>(undefined, `proposed:${walletAddress}:%`)

  return proposedTransformations?.map(
    ({ contractAddress, value: { proposalId } }) => ({
      proposalModule: contractAddress,
      proposalId,
    })
  )
}

export const votesCast: WalletFormula<
  | {
      proposalModule: string
      proposalId: number
      vote: any
      votedAt: string
    }[]
  | undefined
> = async ({ walletAddress, getTransformMatches }) => {
  // Votes for dao-proposal-single and dao-proposal-multiple.
  const voteCastTransformations = await getTransformMatches<{
    proposalId: number
    vote: any
    votedAt: string
  }>(undefined, `voteCast:${walletAddress}:%`)

  return voteCastTransformations?.map(
    ({ contractAddress, value: { proposalId, vote, votedAt } }) => ({
      proposalModule: contractAddress,
      proposalId,
      vote,
      votedAt,
    })
  )
}

export const stats: WalletFormula<{
  created: number
  votesCast: number
}> = async (env) => {
  const [createdResponse, votesCastResponse] = await Promise.all([
    created(env),
    votesCast(env),
  ])

  return {
    created: createdResponse?.length ?? 0,
    votesCast: votesCastResponse?.length ?? 0,
  }
}
