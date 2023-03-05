import request from 'supertest'

import { Account, AccountKey } from '@/db'
import { createWebhookWithEvents, getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('GET /webhooks/:id/events', () => {
  let account: Account
  let key: AccountKey
  let token: string
  beforeEach(async () => {
    const {
      account: _account,
      paidAccountKey,
      token: _token,
    } = await getAccountWithAuth()

    account = _account
    key = paidAccountKey
    token = _token
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .get('/webhooks')
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('gets webhook events', async () => {
    // Create a webhook with 3 events.
    const webhook = await createWebhookWithEvents(account, key, 3)

    await request(app.callback())
      .get(`/webhooks/${webhook.id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        events: await Promise.all(
          webhook.events.map((event) => event.getApiJson())
        ),
      })
  })
})
