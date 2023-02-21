import request from 'supertest'

import { Account } from '@/db'
import { GetAuth, getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('POST /login', () => {
  let account: Account
  let getAuth: GetAuth
  beforeEach(async () => {
    const { account: _account, getAuth: _getAuth } = await getAccountWithAuth()

    account = _account
    getAuth = _getAuth
  })

  it('validates body', async () => {
    await request(app.callback())
      .post('/login')
      .send({})
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid body.',
      })
  })

  it('expects the nonce to match the DB', async () => {
    const auth = await getAuth()

    // Update the account to have a nonce of 100.
    await account.update({ nonce: 100 })

    await request(app.callback())
      .post('/login')
      .send(auth)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Expected nonce: 100',
      })
  })

  it('validates signature', async () => {
    await request(app.callback())
      .post('/login')
      .send({
        ...(await getAuth()),
        signature: 'invalid',
      })
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid signature.',
      })
  })

  it('succeeds with correct signature and increments nonce', async () => {
    // Ensure Account starts at nonce 0.
    const initialNonce = account.nonce

    const response = await request(app.callback())
      .post('/login')
      .send(await getAuth())
      .expect(200)
      .expect('Content-Type', /json/)

    // Token is returned.
    expect(response.body.token).toBeTruthy()

    // Nonce is incremented.
    await account.reload()
    expect(account.nonce).toBe(initialNonce + 1)
  })
})
