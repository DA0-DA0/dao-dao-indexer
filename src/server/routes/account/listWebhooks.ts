import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountCodeIdSet, AccountWebhookApiJson } from '@/db'

import { AccountState } from './types'

type ListWebhooksResponse = {
  webhooks: AccountWebhookApiJson[]
}

export const listWebhooks: Router.Middleware<
  AccountState,
  DefaultContext,
  ListWebhooksResponse
> = async (ctx) => {
  const webhooks = await ctx.state.account.$get('webhooks', {
    include: {
      model: AccountCodeIdSet,
    },
  })

  ctx.status = 200
  ctx.body = {
    webhooks: await Promise.all(
      webhooks.map((webhook) => webhook.getApiJson())
    ),
  }
}
