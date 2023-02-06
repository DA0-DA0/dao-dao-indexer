import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountKeyApiJson, AccountKeyCredit } from '@/db'

import { AccountState } from './types'

type ListKeysResponse = {
  keys: AccountKeyApiJson[]
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
    keys: await Promise.all(keys.map((key) => key.getApiJson())),
  }
}
