import Router from '@koa/router'
import { DefaultContext } from 'koa'

import {
  AccountWebhook,
  AccountWebhookEvent,
  AccountWebhookEventAttempt,
  AccountWebhookEventAttemptApiJson,
} from '@/db'

import { AccountState } from './types'

type GetWebhookEventsResponse =
  | {
      attempt: AccountWebhookEventAttemptApiJson
    }
  | {
      error: string
    }

export const fireWebhookEvent: Router.Middleware<
  AccountState,
  DefaultContext,
  GetWebhookEventsResponse
> = async (ctx) => {
  // Get webhook to make sure it belongs to the account.
  const webhook = await AccountWebhook.findOne({
    where: {
      id: ctx.params.id,
      accountPublicKey: ctx.state.account.publicKey,
    },
    include: {
      model: AccountWebhookEvent,
      where: {
        uuid: ctx.params.uuid,
      },
      required: true,
      include: [
        // Get event attempts in descending creation order, most recent first.
        {
          model: AccountWebhookEventAttempt,
          order: [['createdAt', 'DESC']],
          // So that order works.
          separate: true,
        },
      ],
    },
  })

  const webhookEvent = webhook?.events[0]

  if (!webhookEvent) {
    ctx.status = 404
    ctx.body = {
      error: 'Webhook event not found.',
    }
    return
  }

  // Make sure last attempt was at least 30 seconds ago.
  const lastAttempt = webhookEvent.attempts[0]
  if (lastAttempt && lastAttempt.createdAt.getTime() > Date.now() - 30 * 1000) {
    ctx.status = 429
    ctx.body = {
      error: `You can only fire a webhook once every 30 seconds. You can fire again in ${Math.ceil(
        (lastAttempt.createdAt.getTime() + 30 * 1000 - Date.now()) / 1000
      )} seconds.`,
    }
    return
  }

  const attempt = await webhookEvent.fire()

  ctx.status = 200
  ctx.body = {
    attempt: attempt.apiJson,
  }
}
