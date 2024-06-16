import { BaseQueue, QueueOptions } from './base'
import { ExportQueue } from './export'
import { SearchQueue } from './search'
import { WebhooksQueue } from './webhooks'

// Hack to fix generic constructor on abstract class.
type IQueue = {
  new (options: QueueOptions): BaseQueue<any>
} & typeof BaseQueue<any>

export const queues: IQueue[] = [ExportQueue, SearchQueue, WebhooksQueue]

export * from './base'
export * from './connection'