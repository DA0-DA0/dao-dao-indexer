import { Env } from '@/types'

import { isExpirationExpired } from '../../../utils'
import { doesVoteCountPass } from '../utils/math'
import {
  CheckedMultipleChoiceOption,
  MultipleChoiceOptionType,
  MultipleChoiceProposal,
  MultipleChoiceVotes,
  VoteResult,
} from './types'

// https://github.com/DA0-DA0/dao-contracts/blob/fa567797e2f42e70296a2d6f889f341ff80f0695/contracts/proposal/dao-proposal-multiple/src/proposal.rs#L86
export const isPassed = (
  env: Env,
  proposal: MultipleChoiceProposal
): boolean => {
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

  if (
    doesVoteCountPass(
      totalVotes(votesToConsider),
      BigInt(proposal.total_power),
      proposal.voting_strategy.single_choice.quorum
    )
  ) {
    const voteResult = calculateVoteResult(env, proposal)

    if ('tie' in voteResult) {
      return false
    }

    // 'single_winner' in result
    if (
      voteResult.single_winner.option_type !== MultipleChoiceOptionType.None
    ) {
      if (expired) {
        return true
      } else {
        return isChoiceUnbeatable(
          proposal,
          votesToConsider,
          voteResult.single_winner
        )
      }
    }
  }

  return false
}

// https://github.com/DA0-DA0/dao-contracts/blob/fa567797e2f42e70296a2d6f889f341ff80f0695/contracts/proposal/dao-proposal-multiple/src/proposal.rs#L137
export const isRejected = (
  env: Env,
  proposal: MultipleChoiceProposal
): boolean => {
  const expired = isExpirationExpired(env, proposal.expiration)
  // If not expired, use individual votes, unless they don't exist because this
  // is an older version of the contract.
  const votesToConsider =
    (!expired && proposal.individual_votes) || proposal.votes

  if (proposal.allow_revoting && !expired) {
    return false
  }

  const voteResult = calculateVoteResult(env, proposal)

  if ('tie' in voteResult) {
    return (
      expired || BigInt(proposal.total_power) === totalVotes(votesToConsider)
    )
  }

  // 'single_winner' in result
  const quorumMet = doesVoteCountPass(
    totalVotes(votesToConsider),
    BigInt(proposal.total_power),
    proposal.voting_strategy.single_choice.quorum
  )

  if (quorumMet && expired) {
    return (
      voteResult.single_winner.option_type === MultipleChoiceOptionType.None
    )
  } else if (!expired) {
    // (quorumMet && !expired) || (!quorumMet && !expired)
    return (
      voteResult.single_winner.option_type === MultipleChoiceOptionType.None &&
      isChoiceUnbeatable(proposal, votesToConsider, voteResult.single_winner)
    )
  }

  // !quorumMet && expired
  return true
}

// https://github.com/DA0-DA0/dao-contracts/blob/fa567797e2f42e70296a2d6f889f341ff80f0695/packages/dao-voting/src/multiple_choice.rs#L54
const totalVotes = ({ vote_weights }: MultipleChoiceVotes): bigint =>
  vote_weights.reduce((acc, weight) => acc + BigInt(weight), 0n)

// https://github.com/DA0-DA0/dao-contracts/blob/fa567797e2f42e70296a2d6f889f341ff80f0695/contracts/proposal/dao-proposal-multiple/src/proposal.rs#L186
const calculateVoteResult = (
  env: Env,
  proposal: MultipleChoiceProposal
): VoteResult => {
  const expired = isExpirationExpired(env, proposal.expiration)
  // If not expired, use individual votes, unless they don't exist because this
  // is an older version of the contract.
  const votesToConsider =
    (!expired && proposal.individual_votes) || proposal.votes

  if (votesToConsider.vote_weights.length === 0) {
    throw new Error('No vote weights')
  }

  const maxWeight = votesToConsider.vote_weights.reduce(
    (acc, weight) => (BigInt(weight) > acc ? BigInt(weight) : acc),
    0n
  )

  const topChoices = Array.from(votesToConsider.vote_weights.entries()).filter(
    ([, weight]) => BigInt(weight) === maxWeight
  )
  if (topChoices.length > 1) {
    return { tie: {} }
  }

  return {
    single_winner: proposal.choices[topChoices[0][0]],
  }
}

// https://github.com/DA0-DA0/dao-contracts/blob/fa567797e2f42e70296a2d6f889f341ff80f0695/contracts/proposal/dao-proposal-multiple/src/proposal.rs#L221
const isChoiceUnbeatable = (
  proposal: MultipleChoiceProposal,
  votesToConsider: MultipleChoiceVotes,
  winningChoice: CheckedMultipleChoiceOption
): boolean => {
  const winningChoicePower = BigInt(
    votesToConsider.vote_weights[winningChoice.index]
  )

  const otherChoicePowers = votesToConsider.vote_weights.filter(
    (weight) => BigInt(weight) < winningChoicePower
  )
  if (otherChoicePowers.length === 0) {
    throw new Error('No other choices')
  }

  const secondChoicePower = otherChoicePowers.reduce(
    (acc, weight) => (BigInt(weight) > acc ? BigInt(weight) : acc),
    0n
  )
  const remainingVotePower =
    BigInt(proposal.total_power) - totalVotes(votesToConsider)

  if (winningChoice.option_type === MultipleChoiceOptionType.Standard) {
    return winningChoicePower > secondChoicePower + remainingVotePower
  } else {
    // winningChoice.option_type === MultipleChoiceOptionType.None
    return winningChoicePower >= secondChoicePower + remainingVotePower
  }
}
