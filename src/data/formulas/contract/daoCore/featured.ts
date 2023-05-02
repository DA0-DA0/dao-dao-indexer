import { ContractFormula } from '@/core'

import {
  listMembers as listMembersFormula,
  memberCount as memberCountFormula,
} from './members'
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

    const memberVotingPowers = (
      (await listMembersFormula.compute(env)) ?? []
    ).map(({ votingPowerPercent }) => votingPowerPercent)
    const giniCoefficient =
      memberVotingPowers.length > 0 ? gini(memberVotingPowers) : -1

    const memberCount = await memberCountFormula.compute(env)

    return {
      tvl,
      daysSinceLastProposalPassed,
      giniCoefficient,
      memberCount,
    }
  },
}

const gini = (values: number[]): number => {
  // Mean absolute difference
  const mad = meanAbsoluteDifference(values)
  // Relative mean absolute difference
  const rmad = values.reduce((a, b) => a + b, 0) / values.length
  // Gini coefficient
  const gini = mad / (2 * rmad)
  return gini
}

const meanAbsoluteDifference = (values: number[]): number => {
  let sum = 0
  let count = 0
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      sum += Math.abs(values[i] - values[j])
      count++
    }
  }
  return sum / count
}
