import Router from '@koa/router'
import { DefaultContext, DefaultState } from 'koa'

import { Block } from '@/core/types'
import { State } from '@/db'

type GetStatusResponse =
  | {
      latestBlock: Block
      lastBlockHeightExported: number | null
    }
  | {
      error: string
    }

export const getStatus: Router.Middleware<
  DefaultState,
  DefaultContext,
  GetStatusResponse
> = async (ctx) => {
  const state = await State.getSingleton()
  if (!state) {
    ctx.status = 500
    ctx.body = {
      error: 'State not found.',
    }
    return
  }

  ctx.status = 200
  ctx.body = {
    latestBlock: state.latestBlock,
    lastBlockHeightExported: state.lastBlockHeightExported,
  }
}
