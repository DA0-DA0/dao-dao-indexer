import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { Account } from '@/db'
import { objectMatchesStructure } from '@/utils'

import { verifySignature } from './auth'
import { AccountState, AuthRequestBody } from './types'

type LoginResponse =
  | {
      token: string
    }
  | {
      error: string
    }

export const login: Router.Middleware<
  AccountState,
  DefaultContext,
  LoginResponse
> = async (ctx) => {
  // Parsed by koa-body.
  const body: AuthRequestBody = ctx.request.body

  if (
    // Validate body has the auth fields we need.
    !objectMatchesStructure(body, {
      auth: {
        type: {},
        nonce: {},
        chainId: {},
        chainFeeDenom: {},
        chainBech32Prefix: {},
        publicKey: {},
      },
      signature: {},
    })
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid body.',
    }
    return
  }

  // Find or create account.
  const [account] = await Account.findOrCreate({
    where: {
      publicKey: body.auth.publicKey,
    },
  })

  ctx.state.account = account

  // Validate nonce.
  if (body.auth.nonce !== account.nonce) {
    ctx.status = 401
    ctx.body = {
      error: `Expected nonce: ${account.nonce}`,
    }
    return
  }

  // Validate signature.
  if (!(await verifySignature(body))) {
    ctx.status = 401
    ctx.body = {
      error: 'Invalid signature.',
    }
    return
  }

  // If all is valid, increment nonce to prevent replay attacks.
  await account.increment('nonce')

  try {
    // Generate token.
    const token = account.getAuthToken()

    ctx.status = 200
    ctx.body = {
      token,
    }
  } catch (err) {
    console.error(err)

    ctx.status = 500
    ctx.body = {
      error: err instanceof Error ? err.message : 'Internal server error.',
    }
  }
}
