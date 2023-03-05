import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountCodeIdSet } from '@/db'

import { AccountState } from './types'

type UpdateCodeIdSetRequest = Partial<
  Pick<AccountCodeIdSet, 'name' | 'codeIds'>
>

type UpdateCodeIdSetResponse =
  | undefined
  | {
      error: string
    }

export const updateCodeIdSet: Router.Middleware<
  AccountState,
  DefaultContext,
  UpdateCodeIdSetResponse
> = async (ctx) => {
  const id = ctx.params.id

  const codeIdSet = await AccountCodeIdSet.findByPk(id)
  // Verify code ID set exists and belongs to the account.
  if (
    !codeIdSet ||
    codeIdSet.accountPublicKey !== ctx.state.account.publicKey
  ) {
    ctx.status = 404
    ctx.body = {
      error: 'Code ID set not found.',
    }
    return
  }

  const body: UpdateCodeIdSetRequest = ctx.request.body

  if ('name' in body) {
    // Validate name.
    if (typeof body.name !== 'string' || !body.name?.trim()) {
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

    codeIdSet.name = body.name
  }

  if ('codeIds' in body) {
    // Validate code IDs.
    if (
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

    codeIdSet.codeIds = body.codeIds
  }

  await codeIdSet.save()

  ctx.status = 204
}
