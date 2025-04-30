import Redis, { RedisOptions } from 'ioredis'

import { ConfigManager } from './config'

export const getRedisConfig = (): RedisOptions | undefined => {
  const { redis } = ConfigManager.load()
  return (
    redis && {
      host: redis.host,
      port: redis.port ? Number(redis.port) : undefined,
      password: redis.password,
    }
  )
}

/**
 * Test the connection to Redis.
 */
export const testRedisConnection = async (): Promise<boolean> => {
  const config = getRedisConfig()
  if (!config) {
    return false
  }

  try {
    const redis = new Redis({
      ...config,
      maxRetriesPerRequest: 5,
    })
    // Do nothing on error (to avoid spamming logs).
    redis.on('error', () => {})
    await redis.ping()
    await redis.quit()

    return true
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('maxRetriesPerRequest') ||
        err.message.includes('ENOTFOUND') ||
        err.message.includes('ECONNREFUSED'))
    ) {
      return false
    }

    console.error('Error connecting to Redis:', err)
    return false
  }
}
