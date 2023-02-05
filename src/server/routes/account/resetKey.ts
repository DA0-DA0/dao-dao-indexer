import Router from '@koa/router'

import { objectMatchesStructure } from '@/core'
import { AccountKey } from '@/db'

import { AccountState } from './types'

type ResetKeyBody = Pick<AccountKey, 'name'>

export const resetKey: Router.Middleware<AccountState<ResetKeyBody>> = async (
  ctx
) => {
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

  const existingKeys = await ctx.state.account.$get('keys', {
    where: {
      name: ctx.state.data.name,
    },
  })

  if (existingKeys.length === 0) {
    ctx.status = 400
    ctx.body = {
      error: 'Key not found.',
    }
    return
  }

  // Should be impossible as there's a unique index on [account, name]...
  if (existingKeys.length > 1) {
    ctx.status = 500
    ctx.body = {
      error: 'Multiple keys with same name.',
    }
    return
  }

  const existingKey = existingKeys[0]

  // Generate key with has, and update existing key.
  const { key, hash } = AccountKey.generateKeyAndHash()
  await existingKey.update({
    hashedKey: hash,
  })

  ctx.status = 200
  ctx.body = {
    key,
  }
}
