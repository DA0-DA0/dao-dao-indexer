import request from 'supertest'
import { beforeEach, describe, it } from 'vitest'

import { Account, AccountCodeIdSet, AccountWebhook } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('GET /webhooks', () => {
  let account: Account
  let token: string
  beforeEach(async () => {
    const { account: _account, token: _token } = await getAccountWithAuth()

    account = _account
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

  it('lists webhooks', async () => {
    const codeIdSet = await account.$create('codeIdSet', {
      name: 'contract',
      codeIds: [1, 50, 200],
    })

    const webhook = await account.$create('webhook', {
      description: 'test',
      url: 'https://example.com',
      secret: 'secret',
    })
    await webhook.$add('codeIdSet', codeIdSet)

    await account.reload({
      include: {
        model: AccountWebhook,
        include: [
          {
            model: AccountCodeIdSet,
          },
        ],
      },
    })

    await request(app.callback())
      .get('/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        webhooks: await Promise.all(
          account.webhooks.map((webhook) => webhook.getApiJson())
        ),
      })
  })
})
