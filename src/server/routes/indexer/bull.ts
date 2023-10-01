import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { KoaAdapter } from '@bull-board/koa'

import { EXPORT_QUEUE_NAME, getBullQueue } from '@/core'

export const makeBullBoardJobsMiddleware = () => {
  const serverAdapter = new KoaAdapter()

  createBullBoard({
    queues: [new BullMQAdapter(getBullQueue(EXPORT_QUEUE_NAME))],
    serverAdapter,
  })

  return serverAdapter.registerPlugin({ mount: '/jobs' })
}
