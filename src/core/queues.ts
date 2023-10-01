import { ConnectionOptions, Processor, Queue, Worker } from 'bullmq'

import { loadConfig } from './config'
import { QueueName } from './types'

const getBullConnection = (): ConnectionOptions | undefined => {
  const { redis } = loadConfig()
  return (
    redis && {
      host: redis.host,
      port: redis.port,
      password: redis.password,
    }
  )
}

export const getBullQueue = <T extends unknown>(name: QueueName) =>
  new Queue<T>(name, {
    connection: getBullConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 300,
      },
    },
  })

export const getBullWorker = <T extends unknown>(
  name: QueueName,
  processor: Processor<T>
) =>
  new Worker<T>(name, processor, {
    connection: getBullConnection(),
    removeOnComplete: {
      // Keep last 3 days of successful jobs.
      age: 3 * 24 * 60 * 60,
    },
    // Keep all failed jobs.
  })
