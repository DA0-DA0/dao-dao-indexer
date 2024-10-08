import Router from '@koa/router'
import Koa from 'koa'

import { Config } from '@/types'

import { accountRouter } from './account'
import { setUpDocs } from './docs'
import { indexerRouter } from './indexer'
import { setUpBullBoard } from './jobs'

export type SetupRouterOptions = {
  config: Config
  // Whether to run the account server. If false, runs indexer server.
  accounts: boolean
}

export const setUpRouter = (
  app: Koa,
  { config, accounts }: SetupRouterOptions
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
    // Background jobs dashboard.
    setUpBullBoard(app, config)

    // Swagger API docs.
    setUpDocs(app)

    // Indexer API.
    router.use(indexerRouter.routes(), indexerRouter.allowedMethods())
  }

  // Enable router.
  app.use(router.routes()).use(router.allowedMethods())
}
