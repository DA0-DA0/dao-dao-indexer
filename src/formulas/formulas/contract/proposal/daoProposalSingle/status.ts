import { Env } from '@/types'

import { isExpirationExpired } from '../../../utils'
import { doesVoteCountFail, doesVoteCountPass } from '../utils/math'
import { SingleChoiceProposal, Votes } from './types'

// https://github.com/DA0-DA0/dao-contracts/blob/e1f46b48cc72d4e48bf6afcb44432979347e594c/contracts/proposal/dao-proposal-single/src/proposal.rs#L81
export const isPassed = (env: Env, proposal: SingleChoiceProposal): boolean => {
  const expired = isExpirationExpired(env, proposal.expiration)
  // If not expired, use individual votes, unless they don't exist because this
  // is an older version of the contract.
  const votesToConsider =
    (!expired && proposal.individual_votes) || proposal.votes

  if (proposal.allow_revoting && !expired) {
    return false
  }

  if (
    proposal.min_voting_period &&
    !isExpirationExpired(env, proposal.min_voting_period)
  ) {
    return false
  }

  if ('absolute_percentage' in proposal.threshold) {
    const { percentage } = proposal.threshold.absolute_percentage
    const options =
      BigInt(proposal.total_power) - BigInt(votesToConsider.abstain)
    return doesVoteCountPass(BigInt(votesToConsider.yes), options, percentage)
  } else if ('threshold_quorum' in proposal.threshold) {
    const { threshold, quorum } = proposal.threshold.threshold_quorum

    if (
      !doesVoteCountPass(
        totalVotes(votesToConsider),
        BigInt(proposal.total_power),
        quorum
      )
    ) {
      return false
    }

    if (expired) {
      const options =
        totalVotes(votesToConsider) - BigInt(votesToConsider.abstain)
      return doesVoteCountPass(BigInt(votesToConsider.yes), options, threshold)
    } else {
      const options =
        BigInt(proposal.total_power) - BigInt(votesToConsider.abstain)
      return doesVoteCountPass(BigInt(votesToConsider.yes), options, threshold)
    }
  }

  // 'absolute_count' in proposal.threshold
  const { threshold } = proposal.threshold.absolute_count
  return BigInt(votesToConsider.yes) >= BigInt(threshold)
}

// https://github.com/DA0-DA0/dao-contracts/blob/e1f46b48cc72d4e48bf6afcb44432979347e594c/contracts/proposal/dao-proposal-single/src/proposal.rs#L127
export const isRejected = (
  env: Env,
  proposal: SingleChoiceProposal
): boolean => {
  const expired = isExpirationExpired(env, proposal.expiration)
  // If not expired, use individual votes, unless they don't exist because this
  // is an older version of the contract.
  const votesToConsider =
    (!expired && proposal.individual_votes) || proposal.votes

  if (proposal.allow_revoting && !expired) {
    return false
  }

  if ('absolute_percentage' in proposal.threshold) {
    const { percentage: percentageNeeded } =
      proposal.threshold.absolute_percentage
    const options =
      BigInt(proposal.total_power) - BigInt(votesToConsider.abstain)

    if (
      'percent' in percentageNeeded &&
      Number(percentageNeeded.percent) === 1
    ) {
      if (options === 0n) {
        return true
      } else {
        return BigInt(votesToConsider.no) >= 1n
      }
    }

    return doesVoteCountFail(
      BigInt(votesToConsider.no),
      options,
      percentageNeeded
    )
  } else if ('threshold_quorum' in proposal.threshold) {
    const { threshold, quorum } = proposal.threshold.threshold_quorum

    const quorumMet = doesVoteCountPass(
      totalVotes(votesToConsider),
      BigInt(proposal.total_power),
      quorum
    )

    if (quorumMet && expired) {
      const options =
        totalVotes(votesToConsider) - BigInt(votesToConsider.abstain)

      if ('percent' in threshold && Number(threshold.percent) === 1) {
        if (options === 0n) {
          return true
        } else {
          return BigInt(votesToConsider.no) >= 1n
        }
      }

      return doesVoteCountFail(BigInt(votesToConsider.no), options, threshold)
    } else if (!expired) {
      // (quorumMet && !expired) || (!quorumMet && !expired)

      const options =
        BigInt(proposal.total_power) - BigInt(votesToConsider.abstain)

      if ('percent' in threshold && Number(threshold.percent) === 1) {
        if (options === 0n) {
          return true
        } else {
          return BigInt(votesToConsider.no) >= 1n
        }
      }

      return doesVoteCountFail(BigInt(votesToConsider.no), options, threshold)
    }

    // !quorumMet && expired
    return true
  }

  // 'absolute_count' in proposal.threshold
  const { threshold } = proposal.threshold.absolute_count
  const outstandingVotes =
    BigInt(proposal.total_power) - totalVotes(votesToConsider)
  return BigInt(votesToConsider.yes) + outstandingVotes < BigInt(threshold)
}

// https://github.com/DA0-DA0/dao-contracts/blob/e1f46b48cc72d4e48bf6afcb44432979347e594c/packages/dao-voting/src/voting.rs#L216
const totalVotes = (votes: Votes): bigint =>
  BigInt(votes.yes) + BigInt(votes.no) + BigInt(votes.abstain)
