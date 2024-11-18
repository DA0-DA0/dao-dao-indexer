import Koa from 'koa'
import auth from 'koa-basic-auth'
import mount from 'koa-mount'

import { Config } from '@/types'

import { makeBullBoardJobsMiddleware } from './indexer/bull'

export const setUpBullBoard = (
  app: Koa,
  { exporterDashboardPassword }: Config
) => {
  const bullApp = new Koa()

  bullApp.use(
    auth({
      name: 'exporter',
      pass: exporterDashboardPassword || 'exporter',
    })
  )

  bullApp.use(makeBullBoardJobsMiddleware('/jobs'))

  app.use(mount('/jobs', bullApp))
}
