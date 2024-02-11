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

/**
 * Cache bull queues by name so we don't make duplicates and can close all at
 * once on exit.
 */
export const activeBullQueues: Partial<Record<QueueName, Queue>> = {}

export const getBullQueue = <T extends unknown>(name: QueueName): Queue<T> => {
  if (!activeBullQueues[name]) {
    activeBullQueues[name] = new Queue<T>(name, {
      connection: getBullConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 300,
        },
      },
    })
  }
  return activeBullQueues[name]!
}

/**
 * Closes all active bull queues.
 *
 * @returns `Promise` that resolves when all queues are closed.
 */
export const closeAllBullQueues = async () =>
  await Promise.all(
    Object.values(activeBullQueues).map((queue) => queue.close())
  )

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
