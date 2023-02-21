import request from 'supertest'

import { Account, AccountKey } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('POST /keys/reset', () => {
  let account: Account
  let token: string
  beforeEach(async () => {
    const { account: _account, token: _token } = await getAccountWithAuth()

    account = _account
    token = _token
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .post('/keys/reset')
      .send({})
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('returns error if no name', async () => {
    await request(app.callback())
      .post('/keys/reset')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Missing name.',
      })
  })

  it('returns error if empty name', async () => {
    await request(app.callback())
      .post('/keys/reset')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '',
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Missing name.',
      })
  })

  it('returns error if no matching key for the name', async () => {
    await request(app.callback())
      .post('/keys/reset')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'invalid',
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Key not found.',
      })
  })

  it('does not reset key if no auth token', async () => {
    const key = account.keys[0]
    const initialHash = key.hashedKey

    await request(app.callback())
      .post('/keys/reset')
      .send({
        name: key.name,
      })
      .expect(401)

    // Verify hash not changed in DB.
    await key.reload()
    expect(key.hashedKey).toBe(initialHash)
  })

  it('resets key', async () => {
    const key = account.keys[0]
    const initialHash = key.hashedKey

    const response = await request(app.callback())
      .post('/keys/reset')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: key.name,
      })
      .expect(200)
      .expect('Content-Type', /json/)

    // Verify response.
    expect(response.body.key).toBeTruthy()

    // Verify hash changed in DB.
    await key.reload()
    expect(key.hashedKey).not.toBe(initialHash)

    // Verify hash of returned key matches change.
    expect(AccountKey.hashKey(response.body.key)).not.toBe(initialHash)
    expect(AccountKey.hashKey(response.body.key)).toBe(key.hashedKey)
  })
})
