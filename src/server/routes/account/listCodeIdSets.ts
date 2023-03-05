import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountCodeIdSetApiJson } from '@/db'

import { AccountState } from './types'

type ListCodeIdSetsResponse = {
  codeIdSets: AccountCodeIdSetApiJson[]
}

export const listCodeIdSets: Router.Middleware<
  AccountState,
  DefaultContext,
  ListCodeIdSetsResponse
> = async (ctx) => {
  const codeIdSets = await ctx.state.account.$get('codeIdSets')

  ctx.status = 200
  ctx.body = {
    codeIdSets: await Promise.all(
      codeIdSets.map((codeIdSet) => codeIdSet.apiJson)
    ),
  }
}
