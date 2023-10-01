import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { KoaAdapter } from '@bull-board/koa'

import { EXPORT_QUEUE_NAME, getBullQueue } from '@/core'

export const makeBullBoardJobsMiddleware = (basePath: string) => {
  const serverAdapter = new KoaAdapter().setBasePath(basePath)

  createBullBoard({
    queues: [new BullMQAdapter(getBullQueue(EXPORT_QUEUE_NAME))],
    serverAdapter,
  })

  return serverAdapter.registerPlugin({
    // Mount on root since we wrap this in our own app with auth.
    mount: '/',
  })
}
