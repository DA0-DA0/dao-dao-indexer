import { ContractFormula } from '@/core'

import {
  listMembers as listMembersFormula,
  memberCount as memberCountFormula,
} from './members'
import { allProposals as allProposalsFormula } from './proposals'

type FeaturedRank = {
  tvl: number
  daysSinceLastProposalPassed: number
  giniCoefficient: number
  memberCount: number
  proposalsInLast3MonthsCount: number
  rank: number
}

const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000

// Get attributes used when computing the featured rank.
export const featuredRank: ContractFormula<FeaturedRank> = {
  compute: async (env) => {
    // Sort passed proposals by completedAt date or createdAt date, descending
    // (most recent first).
    const allPassedProposals = (
      (await allProposalsFormula.compute({
        ...env,
        args: {
          filter: 'passed',
        },
      })) ?? []
    )
      .map((proposal) => ({
        ...proposal,
        activityDate: proposal.completedAt ?? proposal.createdAt,
      }))
      .sort((a, b) =>
        a.activityDate && b.activityDate
          ? Date.parse(b.activityDate) - Date.parse(a.activityDate)
          : a.activityDate
          ? -1
          : b.activityDate
          ? 1
          : 0
      )

    const lastPassedProposalDate = allPassedProposals.find(
      (proposal) => proposal.completedAt
    )?.completedAt
    const daysSinceLastProposalPassed = lastPassedProposalDate
      ? Math.floor(
          (Date.now() - Date.parse(lastPassedProposalDate)) /
            (24 * 60 * 60 * 1000)
        )
      : -1

    // Calculate times between each pair of proposals within the last 3 months,
    // including the start and end.
    const threeMonthsAgo = Date.now() - THREE_MONTHS_MS
    const proposalsInLast3Months = allPassedProposals.filter(
      (proposal) =>
        proposal.activityDate &&
        Date.parse(proposal.activityDate) >= threeMonthsAgo
    )
    const proposalTimestampsInLast3Months = [
      threeMonthsAgo,
      ...proposalsInLast3Months.map((proposal) =>
        Date.parse(proposal.activityDate!)
      ),
      Date.now(),
    ]
    const interProposalDurations = proposalTimestampsInLast3Months
      .slice(1)
      .map(
        (timestamp, index) => timestamp - proposalTimestampsInLast3Months[index]
      )

    const interProposalDurationsMean =
      proposalsInLast3Months.length > 0
        ? interProposalDurations.reduce((a, b) => a + b, 0) /
          proposalsInLast3Months.length
        : -1

    const memberVotingPowers = (
      (await listMembersFormula.compute(env)) ?? []
    ).map(({ votingPowerPercent }) => votingPowerPercent)
    const giniCoefficient =
      memberVotingPowers.length > 0 ? gini(memberVotingPowers) : -1

    const memberCount = await memberCountFormula.compute(env)

    const rank =
      // Prioritize lower gini coefficient.
      (1 - giniCoefficient) * 34 +
      // Prioritize more proposals in last 3 months, maxing out at 30.
      (Math.min(proposalsInLast3Months.length, 30) / 30) * 33 +
      // Prioritize lower mean duration between proposals.
      (interProposalDurationsMean <= 1
        ? 0
        : ((45 - interProposalDurationsMean) / 45) * 33)

    return {
      // Not used right now.
      tvl: -1,
      daysSinceLastProposalPassed,
      giniCoefficient,
      memberCount,
      proposalsInLast3MonthsCount: proposalsInLast3Months.length,
      rank,
    }
  },
}

// The Gini coefficient of a set of values. Between 0 and 1, inclusive.
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
