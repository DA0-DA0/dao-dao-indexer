import Router from '@koa/router'
import { DefaultContext, DefaultState } from 'koa'

import { State } from '@/db'
import { getStargateClient } from '@/utils'

type UpBlock = {
  height: number
  timeUnixMs: number
  timestamp: string
}

type UpResponse =
  | {
      chainId: string
      chainBlock: UpBlock
      indexerBlock: UpBlock
      caughtUp: boolean
    }
  | {
      error: string
    }

export const up: Router.Middleware<
  DefaultState,
  DefaultContext,
  UpResponse
> = async (ctx) => {
  const state = await State.getSingleton()
  if (!state) {
    ctx.status = 500
    ctx.body = {
      error: 'State not found.',
    }
    return
  }

  let latestChainBlock
  try {
    latestChainBlock = await (await getStargateClient()).getBlock()
  } catch (err) {
    ctx.status = 500
    ctx.body = {
      error: `Failed to get latest block: ${
        err instanceof Error ? err.message : `${err}`
      }`,
    }
    return
  }

  const chainBlock: UpBlock = {
    height: latestChainBlock.header.height,
    timeUnixMs: new Date(latestChainBlock.header.time).getTime(),
    timestamp: new Date(latestChainBlock.header.time).toISOString(),
  }
  const indexerBlock: UpBlock = {
    height: Number(state.latestBlock.height),
    timeUnixMs: Number(state.latestBlock.timeUnixMs),
    timestamp: state.latestBlockDate.toISOString(),
  }

  // If indexer is within 5 blocks of chain, consider it caught up.
  const caughtUp = indexerBlock.height > chainBlock.height - 5

  ctx.status = caughtUp ? 200 : 412
  ctx.body = {
    chainId: state.chainId,
    chainBlock,
    indexerBlock,
    caughtUp,
  }
}
