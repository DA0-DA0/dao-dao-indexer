import request from 'supertest'
import { beforeEach, describe, it } from 'vitest'

import { Account } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('GET /keys', () => {
  let account: Account
  let token: string
  beforeEach(async () => {
    const { account: _account, token: _token } = await getAccountWithAuth()

    account = _account
    token = _token
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .get('/keys')
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('lists keys', async () => {
    await request(app.callback())
      .get('/keys')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        keys: await Promise.all(account.keys.map((key) => key.getApiJson())),
      })
  })
})
