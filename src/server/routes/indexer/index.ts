import Router from '@koa/router'
import auth from 'koa-basic-auth'

import { Config } from '@/core'

import { makeBullBoardJobsMiddleware } from './bull'
import { computer } from './computer'
import { getStatus } from './getStatus'
import { up } from './up'

export const makeIndexerRouter = ({
  exporterDashboardPassword = 'exporter',
}: Config) => {
  const indexerRouter = new Router()

  // Status.
  indexerRouter.get('/status', getStatus)

  // Check if indexer is caught up.
  indexerRouter.get('/up', up)

  // Bull board (background worker dashboard)
  const router = new Router()
  router.use(
    auth({
      name: 'exporter',
      pass: exporterDashboardPassword,
    }),
    makeBullBoardJobsMiddleware()
  )
  indexerRouter.use('/jobs', router.routes(), router.allowedMethods())

  // Formula computer. This must be the last route since it's a catch-all.
  indexerRouter.get('/(.+)', computer)

  return indexerRouter
}
