import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { objectMatchesStructure } from '@/core'
import { AccountKey, AccountKeyApiJson } from '@/db'

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
  AccountState,
  DefaultContext,
  CreateKeyResponse
> = async (ctx) => {
  const body: CreateKeyRequest = ctx.request.body

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

  body.name = body.name.trim()
  if (body.name.length > 255) {
    ctx.status = 400
    ctx.body = {
      error: 'Name too long.',
    }
    return
  }

  // Verify name uniqueness.
  if (
    await ctx.state.account.$count('keys', {
      where: { name: body.name },
    })
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Name already exists.',
    }
    return
  }

  if (
    typeof body.description === 'string' &&
    body.description.trim().length > 255
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Description too long.',
    }
    return
  }
  body.description = body.description?.trim() || null

  const { apiKey, accountKey } = await ctx.state.account.generateKey({
    name: body.name,
    description: body.description,
  })

  ctx.status = 201
  ctx.body = {
    apiKey,
    createdKey: await accountKey.getApiJson(),
  }
}
