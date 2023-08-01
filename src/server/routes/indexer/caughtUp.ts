import Router from '@koa/router'
import { DefaultContext, DefaultState } from 'koa'

import { getStargateClient } from '@/core/utils'
import { State } from '@/db'

type GetStatusResponse =
  | {
      chainHeight: number
      indexerHeight: number
      caughtUp: boolean
    }
  | { error: string }

export const caughtUp: Router.Middleware<
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

  const stargateClient = await getStargateClient()

  const chainHeight = await stargateClient.getHeight()
  const indexerHeight = Number(state.latestBlockHeight)

  // If indexer is within 5 blocks of chain, consider it caught up.
  const caughtUp = indexerHeight > chainHeight - 5

  ctx.status = caughtUp ? 200 : 412
  ctx.body = {
    chainHeight,
    indexerHeight,
    caughtUp,
  }
}
