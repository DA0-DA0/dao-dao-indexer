import { createMockContext } from '@shopify/jest-koa-mocks'

import { Account } from '@/db'
import { GetSignedBody, getAccountWithSigner } from '@/test/utils'

import { authMiddleware } from '../../routes/account/auth'

describe('authMiddleware', () => {
  let account: Account
  let getSignedBody: GetSignedBody
  beforeEach(async () => {
    const { account: _account, getSignedBody: _getSignedBody } =
      await getAccountWithSigner()

    account = _account
    getSignedBody = _getSignedBody
  })

  it('validates the body', async () => {
    const ctx = createMockContext()

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(400)
    expect(ctx.body).toEqual({ error: 'Invalid body.' })
  })

  it('expects the nonce to match the DB', async () => {
    const ctx = createMockContext({
      requestBody: await getSignedBody({}),
    })

    // Update the account to have a nonce of 100.
    await account.update({ nonce: 100 })

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'Expected nonce: 100' })
  })

  it('fails with incorrect signature', async () => {
    const ctx = createMockContext({
      requestBody: {
        ...(await getSignedBody({})),
        signature: (await getSignedBody({ something_else: true })).signature,
      },
    })

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'Invalid signature.' })
  })

  it('succeeds with correct signature and increments nonce', async () => {
    // Ensure Account starts at nonce 0.
    const initialNonce = account.nonce

    const ctx = createMockContext({
      requestBody: await getSignedBody({}),
    })

    const next = jest.fn()
    await authMiddleware(ctx, next)

    // Next function is called on success.
    expect(next).toHaveBeenCalled()

    // Nonce is incremented.
    await account.reload()
    expect(account.nonce).toBe(initialNonce + 1)
  })
})
