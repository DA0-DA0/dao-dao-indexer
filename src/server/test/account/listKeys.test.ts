import request from 'supertest'

import { Account } from '@/db'
import { GetSignedBody, getAccountWithSigner } from '@/test/utils'

import { app } from './app'

describe('POST /keys/list', () => {
  let account: Account
  let getSignedBody: GetSignedBody
  beforeEach(async () => {
    const { account: _account, getSignedBody: _getSignedBody } =
      await getAccountWithSigner()

    account = _account
    getSignedBody = _getSignedBody
  })

  it('returns error if invalid signature', async () => {
    await request(app.callback())
      .post('/keys/list')
      .send({
        ...(await getSignedBody({})),
        signature: 'invalid',
      })
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid signature.',
      })
  })

  it('lists keys', async () => {
    await request(app.callback())
      .post('/keys/list')
      .send(await getSignedBody({}))
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        keys: await Promise.all(account.keys.map((key) => key.getApiJson())),
      })
  })
})
