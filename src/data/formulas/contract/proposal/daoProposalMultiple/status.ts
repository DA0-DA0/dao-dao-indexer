import { Block } from '@/core'

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
  proposal: MultipleChoiceProposal,
  block: Block
): boolean => {
  const expired = isExpirationExpired(proposal.expiration, block)

  if (proposal.allow_revoting && !expired) {
    return false
  }

  if (
    proposal.min_voting_period &&
    !isExpirationExpired(proposal.min_voting_period, block)
  ) {
    return false
  }

  if (
    doesVoteCountPass(
      totalVotes(proposal.votes),
      BigInt(proposal.total_power),
      proposal.voting_strategy.single_choice.quorum
    )
  ) {
    const voteResult = calculateVoteResult(proposal)

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
        return isChoiceUnbeatable(proposal, voteResult.single_winner)
      }
    }
  }

  return false
}

// https://github.com/DA0-DA0/dao-contracts/blob/fa567797e2f42e70296a2d6f889f341ff80f0695/contracts/proposal/dao-proposal-multiple/src/proposal.rs#L137
export const isRejected = (
  proposal: MultipleChoiceProposal,
  block: Block
): boolean => {
  const expired = isExpirationExpired(proposal.expiration, block)

  if (proposal.allow_revoting && !expired) {
    return false
  }

  const voteResult = calculateVoteResult(proposal)

  if ('tie' in voteResult) {
    return (
      expired || BigInt(proposal.total_power) === totalVotes(proposal.votes)
    )
  }

  // 'single_winner' in result
  const quorumMet = doesVoteCountPass(
    totalVotes(proposal.votes),
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
      isChoiceUnbeatable(proposal, voteResult.single_winner)
    )
  }

  // !quorumMet && expired
  return true
}

// https://github.com/DA0-DA0/dao-contracts/blob/fa567797e2f42e70296a2d6f889f341ff80f0695/packages/dao-voting/src/multiple_choice.rs#L54
const totalVotes = ({ vote_weights }: MultipleChoiceVotes): bigint =>
  vote_weights.reduce((acc, weight) => acc + BigInt(weight), 0n)

// https://github.com/DA0-DA0/dao-contracts/blob/fa567797e2f42e70296a2d6f889f341ff80f0695/contracts/proposal/dao-proposal-multiple/src/proposal.rs#L186
const calculateVoteResult = (proposal: MultipleChoiceProposal): VoteResult => {
  if (proposal.votes.vote_weights.length === 0) {
    throw new Error('No vote weights')
  }

  const maxWeight = proposal.votes.vote_weights.reduce(
    (acc, weight) => (BigInt(weight) > acc ? BigInt(weight) : acc),
    0n
  )

  const topChoices = Array.from(proposal.votes.vote_weights.entries()).filter(
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
  winningChoice: CheckedMultipleChoiceOption
): boolean => {
  const winningChoicePower = BigInt(
    proposal.votes.vote_weights[winningChoice.index]
  )

  const otherChoicePowers = proposal.votes.vote_weights.filter(
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
    BigInt(proposal.total_power) - totalVotes(proposal.votes)

  if (winningChoice.option_type === MultipleChoiceOptionType.Standard) {
    return winningChoicePower > secondChoicePower + remainingVotePower
  } else {
    // winningChoice.option_type === MultipleChoiceOptionType.None
    return winningChoicePower >= secondChoicePower + remainingVotePower
  }
}
