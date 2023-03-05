import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountWebhook } from '@/db'

import { AccountState } from './types'

type DeleteWebhookResponse =
  | undefined
  | {
      error: string
    }

export const deleteWebhook: Router.Middleware<
  AccountState,
  DefaultContext,
  DeleteWebhookResponse
> = async (ctx) => {
  const id = ctx.params.id

  const webhook = await AccountWebhook.findByPk(id)
  // Verify webhook exists and belongs to the account.
  if (!webhook || webhook.accountPublicKey !== ctx.state.account.publicKey) {
    ctx.status = 400
    ctx.body = {
      error: 'Webhook not found.',
    }
    return
  }

  await webhook.destroy()
  ctx.status = 204
}
