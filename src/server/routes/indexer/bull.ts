import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { KoaAdapter } from '@bull-board/koa'

import { EXPORT_QUEUE_NAME, getBullQueue } from '@/core'

const serverAdapter = new KoaAdapter().setBasePath('/jobs')

createBullBoard({
  queues: [new BullMQAdapter(getBullQueue(EXPORT_QUEUE_NAME))],
  serverAdapter,
})

export const bullBoardJobsMiddleware = serverAdapter.registerPlugin()
