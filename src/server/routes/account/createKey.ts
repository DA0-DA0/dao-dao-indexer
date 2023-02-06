import { randomUUID } from 'crypto'

import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { objectMatchesStructure } from '@/core'
import {
  AccountKey,
  AccountKeyApiJson,
  AccountKeyCredit,
  AccountKeyCreditPaymentSource,
} from '@/db'

import { AccountState } from './types'

type CreateKeyRequest = Pick<AccountKey, 'name' | 'description'>

type CreateKeyResponse =
  | {
      apiKey: string
      createdKey: AccountKeyApiJson
    }
  | {
      error: string
    }

export const createKey: Router.Middleware<
  AccountState<CreateKeyRequest>,
  DefaultContext,
  CreateKeyResponse
> = async (ctx) => {
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

  // Verify name uniqueness.
  if (
    await ctx.state.account.$count('keys', {
      where: { name: ctx.state.data.name },
    })
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Name already exists.',
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

  // Generate key with hash, and create AccountKey.
  const { key: apiKey, hash: hashedKey } = AccountKey.generateKeyAndHash()

  const accountKey = await ctx.state.account.$create<AccountKey>('key', {
    name: ctx.state.data.name,
    description: ctx.state.data.description,
    hashedKey,
  })

  await accountKey.$create<AccountKeyCredit>('credit', {
    paymentSource: AccountKeyCreditPaymentSource.CwReceipt,
    paymentId: randomUUID(),
  })

  ctx.status = 201
  ctx.body = {
    apiKey,
    createdKey: await accountKey.getApiJson(),
  }
}
