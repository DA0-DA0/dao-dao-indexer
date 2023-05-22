import Router from '@koa/router'
import axios from 'axios'
import { DefaultContext, DefaultState } from 'koa'

import { loadConfig } from '@/core/config'

export const up: Router.Middleware<DefaultState, DefaultContext> = async (
  ctx
) => {
  const { rpc } = loadConfig()
  if (!rpc) {
    ctx.status = 400
    ctx.body = 'rpc not configured'
    return
  }

  const response = await axios.get(rpc + '/status', {
    // https://stackoverflow.com/a/74735197
    headers: { 'Accept-Encoding': 'gzip,deflate,compress' },
  })

  if (response.status === 200) {
    ctx.status = 200
    ctx.body = 'up'
  } else {
    ctx.status = 503
    ctx.body = 'down'
  }
}
