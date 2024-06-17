import Koa from 'koa'

import { loadConfig } from '@/config'

import { setupRouter } from '../../routes'

export const app = new Koa()

setupRouter(app, {
  config: loadConfig(),
  accounts: true,
})
