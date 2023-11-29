import { Block, Env } from '@/core'

import { Duration, Expiration } from '../types'

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

export const expirationAfterBlock = (
  block: Block,
  delay: Duration
): Expiration => {
  if ('height' in delay) {
    return { at_height: Number(block.height) + delay.height }
  } else if ('time' in delay) {
    // Duration's `time` is in seconds and Expiration's `at_time` is in
    // nanoseconds.
    return {
      at_time: (
        block.timeUnixMs * BigInt(1e3) +
        BigInt(delay.time) * BigInt(1e9)
      ).toString(),
    }
  }

  // Should never happen.
  throw new Error('invalid delay')
}
