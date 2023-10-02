import Koa from 'koa'

import { loadConfig } from '@/core'

import { setupRouter } from '../../routes'

export const app = new Koa()

setupRouter(app, {
  config: loadConfig(),
  accounts: false,
})
