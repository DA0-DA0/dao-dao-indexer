import Router from '@koa/router'
import Koa from 'koa'
import auth from 'koa-basic-auth'
import mount from 'koa-mount'

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
  const jobsApp = new Koa()
  jobsApp.use(
    auth({
      name: 'exporter',
      pass: exporterDashboardPassword,
    })
  )
  jobsApp.use(makeBullBoardJobsMiddleware())
  indexerRouter.use(mount('/jobs', jobsApp))

  // Formula computer. This must be the last route since it's a catch-all.
  indexerRouter.get('/(.+)', computer)

  return indexerRouter
}
