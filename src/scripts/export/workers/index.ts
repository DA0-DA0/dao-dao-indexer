import { ExportWorkerMaker } from '../types'
import { makeExportWorker } from './export'
import { makeSearchWorker } from './search'
import { makeWebhooksWorker } from './webhooks'

export const workerMakers: ExportWorkerMaker<any>[] = [
  makeExportWorker,
  makeSearchWorker,
  makeWebhooksWorker,
]
