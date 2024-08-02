import { Block, ContractFormula, Env, KeyInput } from '@/types'

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

/**
 * Make a simple contract formula with some common error/fallback handling.
 */
export const makeSimpleContractFormula = <
  T = unknown,
  R = T,
  Args extends Record<string, string> = {}
>({
  filter,
  fallback,
  transform = (data: T) => data as unknown as R,
  ...source
}: (
  | {
      /**
       * State key to load from WasmStateEvents table.
       */
      key: KeyInput | KeyInput[]
    }
  | {
      /**
       * Transformation name to load from WasmStateEventTransformations table.
       */
      transformation: string
      /**
       * Fallback state key(s) to load from WasmStateEvents table, fetched in
       * order.
       */
      fallbackKeys?: KeyInput[]
    }
) & {
  /**
   * Filter to apply.
   */
  filter?: ContractFormula['filter']
  /**
   * Optional fallback value if no data is found. If undefined, an error is
   * thrown.
   */
  fallback?: R
  /**
   * Optionally transform the data before returning it.
   */
  transform?: (
    data: T,
    options: {
      args: Partial<Args>
      block: Block
    }
  ) => R
}): ContractFormula<R, Args> => ({
  filter,
  compute: async ({
    contractAddress,
    args,
    block,
    get,
    getTransformationMatch,
  }) => {
    const value =
      'key' in source
        ? await get<T>(contractAddress, ...[source.key].flat())
        : (
            await getTransformationMatch<T>(
              contractAddress,
              source.transformation
            )
          )?.value ??
          // Fallback to events if fallback keys provided.
          (source.fallbackKeys
            ? // Try each fallback key in order, stopping when a value is found.
              await source.fallbackKeys.reduce(async (promise, fallbackKey) => {
                const value = await promise
                if (value !== undefined) {
                  return value
                } else {
                  return await get<T>(contractAddress, fallbackKey)
                }
              }, Promise.resolve<T | undefined>(undefined) as Promise<T | undefined>)
            : undefined)

    if (!value) {
      if (fallback !== undefined) {
        return fallback
      }

      throw new Error('failed to load')
    }

    return transform(value, {
      args,
      block,
    })
  },
})
