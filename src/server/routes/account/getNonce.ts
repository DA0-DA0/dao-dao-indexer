import Router from '@koa/router'
import { DefaultContext, DefaultState } from 'koa'

import { Account } from '@/db'

type GetNonceResponse = {
  nonce: number
}

export const getNonce: Router.Middleware<
  DefaultState,
  DefaultContext,
  GetNonceResponse
> = async (ctx) => {
  const { publicKey } = ctx.params

  const [account] = await Account.findOrCreate({
    where: {
      publicKey,
    },
  })

  ctx.status = 200
  ctx.body = {
    nonce: account.nonce,
  }
}
