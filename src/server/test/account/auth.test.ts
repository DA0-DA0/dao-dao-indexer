import { createMockContext } from '@shopify/jest-koa-mocks'
import jwt from 'jsonwebtoken'

import { loadConfig } from '@/config'
import { Account } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { authMiddleware } from '../../routes/account/auth'

describe('authMiddleware', () => {
  let account: Account
  beforeEach(async () => {
    const { account: _account } = await getAccountWithAuth()
    account = _account
  })

  it('expects the authorization header', async () => {
    const ctx = createMockContext()

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'No token.' })
  })

  it('expects the authorization header to be type Bearer', async () => {
    const ctx = createMockContext({
      headers: {
        Authorization: 'Basic 123',
      },
    })

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'Invalid token type.' })
  })

  it('expects the authorization header to contain a valid JWT', async () => {
    const ctx = createMockContext({
      headers: {
        Authorization: 'Bearer 123',
      },
    })

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'Invalid token.' })
  })

  it('expects the token to be an object', async () => {
    const { accountsJwtSecret } = loadConfig()
    const token = jwt.sign('not an object', accountsJwtSecret!)

    const ctx = createMockContext({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'Invalid token.' })
  })

  it('expects the token to contain a public key', async () => {
    const { accountsJwtSecret } = loadConfig()
    const token = jwt.sign(
      {
        nope: 'not a public key',
      },
      accountsJwtSecret!
    )

    const ctx = createMockContext({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'Invalid token.' })
  })

  it('expects the token to contain a valid public key', async () => {
    const { accountsJwtSecret } = loadConfig()
    const token = jwt.sign(
      {
        publicKey: 'invalid',
      },
      accountsJwtSecret!
    )

    const ctx = createMockContext({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'Invalid token.' })
  })

  it('expects the token to use the correct secret', async () => {
    const { accountsJwtSecret } = loadConfig()
    const token = jwt.sign(
      {
        publicKey: account.publicKey,
      },
      accountsJwtSecret! + 'invalid'
    )

    const ctx = createMockContext({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'Invalid token.' })
  })

  it('succeeds with a valid token', async () => {
    const token = account.getAuthToken()

    const ctx = createMockContext({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const next = jest.fn()
    await authMiddleware(ctx, next)

    // Next function is called on success.
    expect(next).toHaveBeenCalled()

    // Account is set on the context.
    expect(ctx.state.account.publicKey).toEqual(account.publicKey)
  })
})
