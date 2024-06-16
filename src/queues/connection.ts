import * as Sentry from '@sentry/node'
import { ConnectionOptions, Processor, Queue, Worker } from 'bullmq'

import { loadConfig } from '@/core'
import { State } from '@/db/models'

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
export const activeBullQueues: Partial<Record<string, Queue>> = {}

export const getBullQueue = <T extends unknown>(name: string): Queue<T> => {
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

    activeBullQueues[name]?.on('error', async (err) => {
      console.error('Queue error', err)

      Sentry.captureException(err, {
        tags: {
          type: 'queue-error',
          chainId: (await State.getSingleton())?.chainId,
        },
      })
    })
  }
  return activeBullQueues[name]!
}

/**
 * Close all active bull queues.
 *
 * @returns `Promise` that resolves when all queues are closed.
 */
export const closeAllBullQueues = async () =>
  await Promise.all(
    Object.values(activeBullQueues).map((queue) => queue?.close())
  )

/**
 * Close specific bull queue.
 *
 * @returns `Promise` that resolves when queue is closed.
 */
export const closeBullQueue = async (name: string) =>
  activeBullQueues[name]?.close() ?? Promise.resolve()

export const getBullWorker = <T extends unknown>(
  name: string,
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