import Router from '@koa/router'
import Koa from 'koa'

import { accountRouter } from './account'
import { indexerRouter } from './indexer'

export type SetupRouterOptions = {
  // Whether to run the account server. If false, runs indexer server.
  accounts: boolean
}

export const setupRouter = (app: Koa, { accounts }: SetupRouterOptions) => {
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
    // Indexer API.
    router.use(indexerRouter.routes(), indexerRouter.allowedMethods())
  }

  // Enable router.
  app.use(router.routes()).use(router.allowedMethods())
}
