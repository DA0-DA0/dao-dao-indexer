import { PercentageThreshold, Votes } from '../types'

// https://github.com/DA0-DA0/dao-contracts/blob/e1f46b48cc72d4e48bf6afcb44432979347e594c/packages/dao-voting/src/voting.rs#L216
export const totalVotes = (votes: Votes): bigint =>
  BigInt(votes.yes) + BigInt(votes.no) + BigInt(votes.abstain)

// https://github.com/DA0-DA0/dao-contracts/blob/e1f46b48cc72d4e48bf6afcb44432979347e594c/packages/dao-voting/src/voting.rs#L8
const PRECISION_FACTOR = 10n ** 9n

// https://github.com/DA0-DA0/dao-contracts/blob/e1f46b48cc72d4e48bf6afcb44432979347e594c/packages/dao-voting/src/voting.rs#L83
export const compareVoteCount = (
  _votes: bigint,
  cmp: '>' | '>=',
  _totalPower: bigint,
  _passingPercentage: string
): boolean => {
  const votes = _votes * PRECISION_FACTOR
  const totalPower = _totalPower * PRECISION_FACTOR
  const threshold =
    (totalPower * BigInt(_passingPercentage.replace('.', ''))) /
    10n ** BigInt(_passingPercentage.split('.')[1]?.length ?? 0)
  return cmp === '>' ? votes > threshold : votes >= threshold
}

// https://github.com/DA0-DA0/dao-contracts/blob/e1f46b48cc72d4e48bf6afcb44432979347e594c/packages/dao-voting/src/voting.rs#L135
export const doesVoteCountPass = (
  yesVotes: bigint,
  options: bigint,
  percent: PercentageThreshold
): boolean => {
  if (options === 0n) {
    return false
  }

  if ('majority' in percent) {
    return yesVotes * 2n > options
  }

  // 'percent' in percent
  return compareVoteCount(yesVotes, '>=', options, percent.percent)
}

// https://github.com/DA0-DA0/dao-contracts/blob/e1f46b48cc72d4e48bf6afcb44432979347e594c/packages/dao-voting/src/voting.rs#L152
export const doesVoteCountFail = (
  noVotes: bigint,
  options: bigint,
  percent: PercentageThreshold
): boolean => {
  if (options === 0n) {
    return true
  }

  if ('majority' in percent) {
    return noVotes * 2n >= options
  }

  // 'percent' in percent
  return compareVoteCount(
    noVotes,
    '>',
    options,
    (1 - Number(percent.percent)).toString()
  )
}
