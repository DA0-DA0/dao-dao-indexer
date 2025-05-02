import Koa from 'koa'

import { ConfigManager } from '@/config'

import { setUpRouter } from '../../routes'

export const app = new Koa()

setUpRouter(app, {
  config: ConfigManager.load(),
  accounts: false,
})
