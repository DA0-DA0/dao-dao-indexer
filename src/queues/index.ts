import { BaseQueue, QueueOptions } from './base'
import * as Queues from './queues'

// Hack to fix generic constructor on abstract class.
type IQueue = {
  new (options: QueueOptions): BaseQueue<any>
} & typeof BaseQueue<any>

export const queues: IQueue[] = Object.values(Queues)

export * from './base'
export * from './connection'
