import { ConnectionOptions, Processor, Queue, Worker } from 'bullmq'

import { loadConfig } from './config'

export const EXPORT_QUEUE_NAME = 'export'

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

export const getBullQueue = <T extends unknown>(name: string) =>
  new Queue<T>(name, {
    connection: getBullConnection(),
  })

export const WorkerQueue = <T extends unknown>(
  name: string,
  processor: Processor<T>
) =>
  new Worker<T>(name, processor, {
    connection: getBullConnection(),
  })
