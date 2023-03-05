import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountCodeIdSet } from '@/db'

import { AccountState } from './types'

type DeleteCodeIdSetResponse =
  | undefined
  | {
      error: string
    }

export const deleteCodeIdSet: Router.Middleware<
  AccountState,
  DefaultContext,
  DeleteCodeIdSetResponse
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

  await codeIdSet.destroy()
  ctx.status = 204
}
