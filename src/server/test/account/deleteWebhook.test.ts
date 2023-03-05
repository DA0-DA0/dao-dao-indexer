import request from 'supertest'

import { AccountWebhook } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('DELETE /webhooks/:id', () => {
  let token: string
  let webhook: AccountWebhook
  beforeEach(async () => {
    const { account, token: _token } = await getAccountWithAuth()

    token = _token

    webhook = await account.$create('webhook', {
      description: 'test',
      url: 'https://example.com',
      secret: 'secret',
      stateKey: 'stateKey',
    })
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .delete(`/webhooks/${webhook.id}`)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('returns error if webhook does not exist', async () => {
    await request(app.callback())
      .delete(`/webhooks/${webhook.id + 1}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Webhook not found.',
      })
  })

  it('returns error if webhook owned by another account', async () => {
    const { account: anotherAccount } = await getAccountWithAuth()
    const anotherWebhook = await anotherAccount.$create('webhook', {
      description: 'test',
      url: 'https://example.com',
      secret: 'secret',
      stateKey: 'stateKey',
    })

    await request(app.callback())
      .delete(`/webhooks/${anotherWebhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Webhook not found.',
      })
  })

  it('deletes webhook', async () => {
    const initialWebhooks = await AccountWebhook.count()

    await request(app.callback())
      .delete(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)

    expect(await AccountWebhook.count()).toBe(initialWebhooks - 1)
  })
})
