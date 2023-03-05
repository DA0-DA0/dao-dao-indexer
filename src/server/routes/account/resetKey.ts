import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountKey } from '@/db'

import { AccountState } from './types'

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
  const existingKey = await AccountKey.findOne({
    where: {
      accountPublicKey: ctx.state.account.publicKey,
      id: ctx.params.id,
    },
  })

  if (!existingKey) {
    ctx.status = 404
    ctx.body = {
      error: 'Key not found.',
    }
    return
  }

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
