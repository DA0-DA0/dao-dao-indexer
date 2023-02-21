import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { objectMatchesStructure } from '@/core'
import { AccountKey } from '@/db'

import { AccountState } from './types'

type ResetKeyRequest = Pick<AccountKey, 'name'>

type ResetKeyResponse =
  | {
      key: string
    }
  | {
      error: string
    }

export const resetKey: Router.Middleware<
  AccountState,
  DefaultContext,
  ResetKeyResponse
> = async (ctx) => {
  const body: ResetKeyRequest = ctx.request.body

  if (
    !objectMatchesStructure(body, {
      name: {},
    }) ||
    !body.name?.trim()
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Missing name.',
    }
    return
  }

  const existingKeys = await ctx.state.account.$get('keys', {
    where: {
      name: body.name,
    },
  })

  if (existingKeys.length === 0) {
    ctx.status = 400
    ctx.body = {
      error: 'Key not found.',
    }
    return
  }

  // Should be impossible as there's a unique index on [account, name].
  if (existingKeys.length > 1) {
    ctx.status = 500
    ctx.body = {
      error: 'Multiple keys with same name.',
    }
    return
  }

  const existingKey = existingKeys[0]

  // Generate key with hash, and update existing key.
  const { key, hash } = AccountKey.generateKeyAndHash()
  await existingKey.update({
    hashedKey: hash,
  })

  ctx.status = 200
  ctx.body = {
    key,
  }
}
