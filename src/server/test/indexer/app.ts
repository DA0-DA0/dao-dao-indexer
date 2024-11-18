import Koa from 'koa'

import { loadConfig } from '@/config'

import { setUpRouter } from '../../routes'

export const app = new Koa()

setUpRouter(app, {
  config: loadConfig(),
  accounts: false,
})
