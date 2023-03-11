import Router from '@koa/router'
import { DefaultContext, DefaultState } from 'koa'

import { SerializedBlock } from '@/core/types'
import { serializeBlock } from '@/core/utils'
import { State } from '@/db'

type GetStatusResponse =
  | {
      latestBlock: SerializedBlock
      lastStakingBlockHeightExported: string | null
      lastWasmBlockHeightExported: string | null
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
    latestBlock: serializeBlock(state.latestBlock),
    lastStakingBlockHeightExported:
      state.lastStakingBlockHeightExported?.toString() || null,
    lastWasmBlockHeightExported:
      state.lastWasmBlockHeightExported?.toString() || null,
  }
}
