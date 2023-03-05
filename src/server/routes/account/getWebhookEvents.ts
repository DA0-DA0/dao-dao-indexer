import Router from '@koa/router'
import { DefaultContext } from 'koa'

import {
  AccountWebhook,
  AccountWebhookEvent,
  AccountWebhookEventApiJson,
  AccountWebhookEventAttempt,
} from '@/db'

import { AccountState } from './types'

type GetWebhookEventsResponse =
  | {
      events: AccountWebhookEventApiJson[]
    }
  | {
      error: string
    }

export const getWebhookEvents: Router.Middleware<
  AccountState,
  DefaultContext,
  GetWebhookEventsResponse
> = async (ctx) => {
  const webhook = await AccountWebhook.findOne({
    where: {
      id: ctx.params.id,
      accountPublicKey: ctx.state.account.publicKey,
    },
    include: {
      model: AccountWebhookEvent,
      order: [['createdAt', 'DESC']],
      // So that order works.
      separate: true,
      include: [
        {
          model: AccountWebhookEventAttempt,
        },
      ],
    },
  })

  if (!webhook) {
    ctx.status = 404
    ctx.body = {
      error: 'Webhook not found.',
    }
    return
  }

  ctx.status = 200
  ctx.body = {
    events: await Promise.all(
      webhook.events.map((event) => event.getApiJson())
    ),
  }
}
