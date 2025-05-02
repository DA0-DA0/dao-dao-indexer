import Koa from 'koa'
import auth from 'koa-basic-auth'
import mount from 'koa-mount'

import { testRedisConnection } from '@/config/redis'
import { Config } from '@/types'

import { makeBullBoardJobsMiddleware } from './indexer/bull'

export const setUpBullBoard = async (
  app: Koa,
  { exporterDashboardPassword }: Config
) => {
  // Test redis connection. If it fails, don't start the bull board.
  if (!(await testRedisConnection())) {
    console.error('REDIS CONNECTION FAILED, SKIPPING BULL BOARD\n')
    return
  }

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
