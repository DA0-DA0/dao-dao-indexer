import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountKeyCredit, AccountKeyCreditPaymentSource } from '@/db'

import { AccountState } from './types'

type ListKeysResponse = {
  keys: {
    name: string
    description: string | null
    credits: {
      paymentSource: AccountKeyCreditPaymentSource
      paymentId: string
      paidFor: boolean
      paidAt: string | null
      amount: string // serialized bigint
      used: string // serialized bigint
    }[]
  }[]
}

export const listKeys: Router.Middleware<
  AccountState,
  DefaultContext,
  ListKeysResponse
> = async (ctx) => {
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
          amount: amount.toString(),
          used: used.toString(),
        })
      ),
    })),
  }
}
