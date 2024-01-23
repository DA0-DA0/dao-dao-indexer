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
  interProposalDurationsMedian: number
}

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

    // Calculate times between each pair of proposals within the last 3 months.
    const proposalsInLast3Months = allPassedProposals.filter(
      (proposal) =>
        proposal.activityDate &&
        Date.parse(proposal.activityDate) >
          Date.now() - 3 * 30 * 24 * 60 * 60 * 1000
    )
    const interProposalDurations = proposalsInLast3Months
      .slice(1)
      .map(
        (proposal, index) =>
          Date.parse(proposal.activityDate!) -
          Date.parse(proposalsInLast3Months[index].activityDate!)
      )

    const interProposalDurationsMedian =
      interProposalDurations.length > 0
        ? interProposalDurations.sort((a, b) => a - b)[
            Math.floor(interProposalDurations.length / 2)
          ]
        : -1

    const memberVotingPowers = (
      (await listMembersFormula.compute(env)) ?? []
    ).map(({ votingPowerPercent }) => votingPowerPercent)
    const giniCoefficient =
      memberVotingPowers.length > 0 ? gini(memberVotingPowers) : -1

    const memberCount = await memberCountFormula.compute(env)

    return {
      // Not used right now.
      tvl: -1,
      daysSinceLastProposalPassed,
      giniCoefficient,
      memberCount,
      proposalsInLast3MonthsCount: proposalsInLast3Months.length,
      interProposalDurationsMedian,
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
