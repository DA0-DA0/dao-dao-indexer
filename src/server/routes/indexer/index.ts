import Router from '@koa/router'
import auth from 'koa-basic-auth'

import { Config } from '@/core'

import { bullBoardJobsMiddleware } from './bull'
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
  // Route: /jobs (defined in ./bull.ts)
  indexerRouter.use(
    auth({
      name: 'exporter',
      pass: exporterDashboardPassword,
    }),
    bullBoardJobsMiddleware
  )

  // Formula computer. This must be the last route since it's a catch-all.
  indexerRouter.get('/(.+)', computer)

  return indexerRouter
}
