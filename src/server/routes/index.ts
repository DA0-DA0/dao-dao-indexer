import Router from '@koa/router'
import Koa from 'koa'
import auth from 'koa-basic-auth'
import mount from 'koa-mount'

import { Config } from '@/core/types'

import { accountRouter } from './account'
import { indexerRouter } from './indexer'
import { makeBullBoardJobsMiddleware } from './indexer/bull'

export type SetupRouterOptions = {
  config: Config
  // Whether to run the account server. If false, runs indexer server.
  accounts: boolean
}

export const setupRouter = (
  app: Koa,
  { config: { exporterDashboardPassword }, accounts }: SetupRouterOptions
) => {
  const router = new Router()

  // Ping.
  router.get('/ping', (ctx) => {
    ctx.status = 200
    ctx.body = 'pong'
  })

  if (accounts) {
    // Account API.
    router.use(accountRouter.routes(), accountRouter.allowedMethods())
  } else {
    const bullApp = new Koa()
    bullApp.use(
      auth({
        name: 'exporter',
        pass: exporterDashboardPassword || 'exporter',
      })
    )
    bullApp.use(makeBullBoardJobsMiddleware('/jobs'))
    app.use(mount('/jobs', bullApp))

    // Indexer API.
    router.use(indexerRouter.routes(), indexerRouter.allowedMethods())
  }

  // Enable router.
  app.use(router.routes()).use(router.allowedMethods())
}
