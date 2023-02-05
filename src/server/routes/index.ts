import Router from '@koa/router'
import Koa from 'koa'

import { State } from '@/db'

import { accountRouter } from './account'
import { computer } from './computer'

type SetupRouterOptions = {
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

  // Status.
  router.get('/status', async (ctx) => {
    const state = await State.findOne()
    if (!state) {
      throw new Error('State not found')
    }

    ctx.status = 200
    ctx.body = {
      latestBlock: state.latestBlock,
      lastBlockHeightExported: state.lastBlockHeightExported,
    }
  })

  if (accounts) {
    // Account API.
    router.use(accountRouter.routes(), accountRouter.allowedMethods())
  } else {
    // Formula computer. This must be the last route since it's a catch-all.
    router.get('/(.+)', computer)
  }

  // Enable router.
  app.use(router.routes()).use(router.allowedMethods())
}
