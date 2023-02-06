import Koa from 'koa'

import { setupRouter } from '../../routes'

export const app = new Koa()

setupRouter(app, {
  accounts: false,
})
