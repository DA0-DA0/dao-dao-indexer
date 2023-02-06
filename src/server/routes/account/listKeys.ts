import Router from '@koa/router'

import { AccountKeyCredit } from '@/db'

import { AccountState } from './types'

export const listKeys: Router.Middleware<AccountState> = async (ctx) => {
  const keys = await ctx.state.account.$get('keys', {
    include: {
      model: AccountKeyCredit,
    },
  })

  ctx.status = 200
  ctx.body = {
    keys: keys.map(({ name, description, credits }) => ({
      name,
      description,
      credits: credits.map(
        ({ paymentSource, paymentId, amount, used, paidFor, paidAt }) => ({
          paymentSource,
          paymentId,
          paidFor,
          paidAt: paidAt?.toISOString() || null,
          amount,
          used,
        })
      ),
    })),
  }
}
