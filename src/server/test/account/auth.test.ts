import { Secp256k1HdWallet, makeSignDoc } from '@cosmjs/amino'
import { toHex } from '@cosmjs/encoding'
import { createMockContext } from '@shopify/jest-koa-mocks'

import { Account } from '@/db'

import { authMiddleware } from '../../routes/account/auth'

const AUTH = {
  type: 'auth',
  chainId: 'test',
  chainFeeDenom: 'test',
  chainBech32Prefix: 'test',
}

describe('authMiddleware', () => {
  let wallet: Secp256k1HdWallet
  let address: string
  let publicKey: string
  beforeEach(async () => {
    wallet = await Secp256k1HdWallet.generate(undefined, {
      prefix: AUTH.chainBech32Prefix,
    })
    const [account] = await wallet.getAccounts()
    address = account.address
    publicKey = toHex(account.pubkey)
  })

  it('validates the body', async () => {
    const ctx = createMockContext()

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(400)
    expect(ctx.body).toEqual({ error: 'Invalid body.' })
  })

  it('expects the nonce to be 0 for new accounts', async () => {
    const ctx = createMockContext({
      requestBody: {
        data: {
          auth: {
            ...AUTH,
            nonce: 99,
            publicKey,
          },
        },
        signature: 'test',
      },
    })

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'Unauthorized. Expected nonce: 0' })
  })

  it('fails with incorrect signature', async () => {
    const ctx = createMockContext({
      requestBody: {
        data: {
          auth: {
            ...AUTH,
            nonce: 0,
            publicKey,
          },
        },
        signature: 'test',
      },
    })

    await authMiddleware(ctx, async () => {})

    expect(ctx.status).toBe(401)
    expect(ctx.body).toEqual({ error: 'Unauthorized. Invalid signature.' })
  })

  it('succeeds with correct signature and increments nonce', async () => {
    const data = {
      auth: {
        ...AUTH,
        nonce: 0,
        publicKey,
      },
    }
    const signature = (
      await wallet.signAmino(
        address,
        makeSignDoc(
          [
            {
              type: AUTH.type,
              value: {
                signer: address,
                data: JSON.stringify(data, undefined, 2),
              },
            },
          ],
          {
            gas: '0',
            amount: [
              {
                denom: data.auth.chainFeeDenom,
                amount: '0',
              },
            ],
          },
          AUTH.chainId,
          '',
          0,
          0
        )
      )
    ).signature.signature
    const ctx = createMockContext({
      requestBody: {
        data,
        signature,
      },
    })

    const next = jest.fn()
    await authMiddleware(ctx, next)

    // Next function is called on success.
    expect(next).toHaveBeenCalled()

    // Nonce is incremented.
    expect((await Account.findByPk(publicKey))?.nonce).toBe(1)
  })
})
