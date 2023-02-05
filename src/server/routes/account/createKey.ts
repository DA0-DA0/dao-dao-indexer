import { randomUUID } from 'crypto'

import Router from '@koa/router'

import { objectMatchesStructure } from '@/core'
import {
  AccountKey,
  AccountKeyCredit,
  AccountKeyCreditPaymentSource,
} from '@/db'

import { AccountState } from './types'

type CreateKeyBody = Pick<AccountKey, 'name' | 'description'>

export const createKey: Router.Middleware<AccountState<CreateKeyBody>> = async (
  ctx
) => {
  // Generate key with hash, and create AccountKey.
  const { key, hash } = AccountKey.generateKeyAndHash()

  if (
    !objectMatchesStructure(ctx.state.data, {
      name: {},
    }) ||
    !ctx.state.data.name?.trim()
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Missing name.',
    }
    return
  }

  ctx.state.data.name = ctx.state.data.name.trim()
  if (ctx.state.data.name.length > 255) {
    ctx.status = 400
    ctx.body = {
      error: 'Name too long.',
    }
    return
  }

  if (
    typeof ctx.state.data.description === 'string' &&
    ctx.state.data.description.trim().length > 255
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Description too long.',
    }
    return
  }
  ctx.state.data.description = ctx.state.data.description?.trim() || null

  const accountKey = await ctx.state.account.$create<AccountKey>('key', {
    name: ctx.state.data.name,
    description: ctx.state.data.description,
    hashedKey: hash,
  })

  const paymentId = randomUUID()
  await accountKey.$create<AccountKeyCredit>('credit', {
    paymentSource: AccountKeyCreditPaymentSource.CwReceipt,
    paymentId,
  })

  ctx.status = 201
  ctx.body = {
    key,
    paymentId,
  }
}
