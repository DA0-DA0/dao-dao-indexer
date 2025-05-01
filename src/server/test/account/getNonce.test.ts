import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { Account } from '@/db'

import { app } from './app'

describe('GET /nonce/:publicKey', () => {
  it('returns 404 if no public key', async () => {
    await request(app.callback()).get('/nonce').expect(404)
  })

  it('creates a new account defaulting nonce to 0 if none exists', async () => {
    expect(await Account.count()).toBe(0)

    await request(app.callback())
      .get('/nonce/0x123')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        nonce: 0,
      })

    expect(await Account.count()).toBe(1)
  })

  it('returns the nonce of an existing account', async () => {
    await Account.create({
      publicKey: '0x123',
      nonce: 1,
    })

    await request(app.callback())
      .get('/nonce/0x123')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        nonce: 1,
      })

    expect(await Account.count()).toBe(1)
  })
})
