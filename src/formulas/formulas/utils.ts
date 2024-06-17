import { Env } from '@/types'

import { Duration, Expiration } from './types'

export const isExpirationExpired = (
  env: Env,
  expiration: Expiration
): boolean => {
  if ('at_height' in expiration) {
    return env.block.height >= expiration.at_height
  } else if ('at_time' in expiration) {
    // Use `env.date` to compare instead of `env.block` since it will be more
    // accurate. `env.block` contains the time the block occurred, so it will be
    // slightly behind the actual time, whereas `env.date` is the current time.
    // If using a block in the past, the `env.date` will be the time the block,
    // so this is ok.

    // at_time is in nanoseconds, so convert to milliseconds.
    return env.date.getTime() >= Number(expiration.at_time) / 1e6
  }
  // Never expires.
  return false
}

export const expirationPlusDuration = (
  expiration: Expiration,
  duration: Duration
): Expiration => {
  if ('at_height' in expiration && 'height' in duration) {
    return { at_height: expiration.at_height + duration.height }
  } else if ('at_time' in expiration && 'time' in duration) {
    // `duration.time` is in seconds, so convert to nanoseconds for `at_time`.
    return {
      at_time: BigInt(
        Number(expiration.at_time) + duration.time * 1e9
      ).toString(),
    }
  }

  // Should never happen.
  throw new Error('expiration duration units mismatch')
}
