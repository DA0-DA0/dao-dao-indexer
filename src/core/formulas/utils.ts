import { Block } from '../types'
import { Expiration } from './types'

export const isExpirationExpired = (
  expiration: Expiration,
  block: Block
): boolean => {
  if ('at_height' in expiration) {
    return block.height >= expiration.at_height
  } else if ('at_time' in expiration) {
    // at_time is in nanoseconds, so convert to milliseconds.
    return block.timeUnixMs >= Number(expiration.at_time) / 1e6
  }
  // Never expires.
  return false
}
