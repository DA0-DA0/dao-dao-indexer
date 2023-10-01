import { ExportWorkerMaker } from '../types'
import { makeExportWorker } from './export'
import { makeWebhooksWorker } from './webhooks'

export const workerMakers: ExportWorkerMaker<any>[] = [
  makeExportWorker,
  makeWebhooksWorker,
]
