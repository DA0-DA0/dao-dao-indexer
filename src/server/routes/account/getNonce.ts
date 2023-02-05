import Router from '@koa/router'

import { Account } from '@/db'

export const getNonce: Router.Middleware = async (ctx) => {
  const { publicKey } = ctx.params
  if (!publicKey) {
    ctx.status = 400
    ctx.body = 'Missing public key.'
    return
  }

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
