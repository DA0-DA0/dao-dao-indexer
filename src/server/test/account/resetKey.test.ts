import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { Account, AccountKey } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('POST /keys/:id/reset', () => {
  let account: Account
  let key: AccountKey
  let token: string
  beforeEach(async () => {
    const {
      account: _account,
      unpaidAccountKey,
      token: _token,
    } = await getAccountWithAuth()

    account = _account
    key = unpaidAccountKey
    token = _token
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .post(`/keys/${key.id}/reset`)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('returns error if no key', async () => {
    await request(app.callback())
      .post('/keys/100/reset')
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Key not found.',
      })
  })

  it('returns error if key not owned by this account', async () => {
    const { unpaidAccountKey: anotherKey } = await getAccountWithAuth()

    await request(app.callback())
      .post(`/keys/${anotherKey.id}/reset`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Key not found.',
      })
  })

  it('does not reset key if no auth token', async () => {
    const key = account.keys[0]
    const initialHash = key.hashedKey

    await request(app.callback()).post(`/keys/${key.id}/reset`).expect(401)

    // Verify hash not changed in DB.
    await key.reload()
    expect(key.hashedKey).toBe(initialHash)
  })

  it('resets key', async () => {
    const key = account.keys[0]
    const initialHash = key.hashedKey

    const response = await request(app.callback())
      .post(`/keys/${key.id}/reset`)
      .set('Authorization', `Bearer ${token}`)
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
