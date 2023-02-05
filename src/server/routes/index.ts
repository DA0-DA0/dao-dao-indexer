import Router from '@koa/router'
import Koa from 'koa'

import { State } from '@/db'

import { computer } from './computer'

export const setupRouter = (app: Koa) => {
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

  // Formula computer.
  router.get('/(.+)', computer)

  // Enable router.
  app.use(router.routes()).use(router.allowedMethods())
}
