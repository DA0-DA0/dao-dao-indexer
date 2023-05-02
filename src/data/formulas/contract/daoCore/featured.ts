import { ContractFormula } from '@/core'

import { memberCount as memberCountFormula } from './members'
import { allPassedProposals as allPassedProposalsFormula } from './proposals'
import { tvl as tvlFormula } from './tvl'

type FeaturedRank = {
  tvl: number
  daysSinceLastProposalPassed: number
  giniCoefficient: number
  memberCount: number
}

// Get attributes used when computing the featured rank.
export const featuredRank: ContractFormula<FeaturedRank> = {
  dynamic: true,
  compute: async (env) => {
    const tvl = await tvlFormula.compute(env)

    // Sort proposals by completedAt date, descending, most recent first.
    const allPassedProposals = (
      (await allPassedProposalsFormula.compute(env)) ?? []
    ).sort((a, b) =>
      a.completedAt && b.completedAt
        ? new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
        : a.completedAt
        ? -1
        : 1
    )

    const daysSinceLastProposalPassed =
      allPassedProposals.length > 0 && allPassedProposals[0].completedAt
        ? Math.floor(
            (new Date().getTime() -
              new Date(allPassedProposals[0].completedAt).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : -1

    // TODO: Compute.
    const giniCoefficient = 0

    const memberCount = await memberCountFormula.compute(env)

    return {
      tvl,
      daysSinceLastProposalPassed,
      giniCoefficient,
      memberCount,
    }
  },
}
