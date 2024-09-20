import { AccountFormula } from '@/types'

import { VoteCast } from '../types'

export const created: AccountFormula<
  | {
      proposalModule: string
      proposalId: number
    }[]
> = {
  compute: async ({ address: walletAddress, getTransformationMatches }) => {
    // Proposals for v1/v2 dao-proposal-single and v2 dao-proposal-multiple.
    const proposedTransformations =
      (await getTransformationMatches<{
        proposalId: number
      }>(undefined, `proposed:${walletAddress}:*`)) ?? []

    return proposedTransformations.map(
      ({ contractAddress, value: { proposalId } }) => ({
        proposalModule: contractAddress,
        proposalId,
      })
    )
  },
}

export const votesCast: AccountFormula<
  | ({
      proposalModule: string
      proposalId: number
    } & Omit<VoteCast, 'voter'>)[]
> = {
  compute: async ({ address: walletAddress, getTransformationMatches }) => {
    // Votes for dao-proposal-single and dao-proposal-multiple.
    const voteCastTransformations =
      (await getTransformationMatches<VoteCast>(
        undefined,
        `voteCast:${walletAddress}:*`
      )) ?? []

    return voteCastTransformations.map(
      ({ contractAddress, name, value: { vote, votedAt } }) => ({
        proposalModule: contractAddress,
        proposalId: Number(name.split(':')[2]),
        vote,
        votedAt,
      })
    )
  },
}

export const stats: AccountFormula<{
  created: number
  votesCast: number
}> = {
  compute: async (env) => {
    const [createdResponse, votesCastResponse] = await Promise.all([
      created.compute(env),
      votesCast.compute(env),
    ])

    return {
      created: createdResponse?.length ?? 0,
      votesCast: votesCastResponse?.length ?? 0,
    }
  },
}
