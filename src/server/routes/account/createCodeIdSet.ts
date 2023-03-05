import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { objectMatchesStructure } from '@/core'
import { AccountCodeIdSet } from '@/db'

import { AccountState } from './types'

type CreateCodeIdSetRequest = Pick<AccountCodeIdSet, 'name' | 'codeIds'>

type CreateCodeIdSetResponse =
  | undefined
  | {
      error: string
    }

export const createCodeIdSet: Router.Middleware<
  AccountState,
  DefaultContext,
  CreateCodeIdSetResponse
> = async (ctx) => {
  const body: CreateCodeIdSetRequest = ctx.request.body

  // Validate name.
  if (
    !objectMatchesStructure(body, {
      name: {},
    }) ||
    typeof body.name !== 'string' ||
    !body.name?.trim()
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid name.',
    }
    return
  }
  body.name = body.name.trim()
  // Validate name length.
  if (body.name.trim().length > 255) {
    ctx.status = 400
    ctx.body = {
      error: 'Name too long.',
    }
    return
  }

  // Validate code IDs.
  if (
    !objectMatchesStructure(body, {
      codeIds: {},
    }) ||
    !Array.isArray(body.codeIds) ||
    body.codeIds.length === 0 ||
    body.codeIds.some(
      (codeId) => typeof codeId !== 'number' || !Number.isInteger(codeId)
    )
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid code IDs.',
    }
    return
  }

  await ctx.state.account.$create<AccountCodeIdSet>('codeIdSet', {
    name: body.name,
    codeIds: body.codeIds,
  })

  ctx.status = 201
}
