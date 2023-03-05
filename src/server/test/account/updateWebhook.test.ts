import request from 'supertest'

import { Account, AccountCodeIdSet, AccountKey, AccountWebhook } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('PATCH /webhooks/:id', () => {
  let account: Account
  let accountKey: AccountKey
  let token: string
  let codeIdSet: AccountCodeIdSet
  let webhook: AccountWebhook
  beforeEach(async () => {
    const {
      account: _account,
      paidAccountKey,
      unpaidAccountKey,
      token: _token,
    } = await getAccountWithAuth()

    account = _account
    accountKey = unpaidAccountKey
    token = _token

    codeIdSet = await account.$create('codeIdSet', {
      name: 'contract',
      codeIds: [1, 50, 200],
    })

    await request(app.callback())
      .post('/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountKeyId: paidAccountKey.id,
        description: 'test',
        url: 'https://example.com',
        codeIdSetIds: [codeIdSet.id],
        contractAddresses: ['junoContract1', 'junoContract2'],
        stateKey: 'stateKey',
        stateKeyIsPrefix: false,
      })
      .expect(201)

    webhook = (await account.$get('webhooks'))[0]
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .send({})
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('returns error if invalid key', async () => {
    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountKeyId: -1,
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid key.',
      })
  })

  it("returns error if another account's key", async () => {
    // Make new account and use key.
    const { paidAccountKey } = await getAccountWithAuth()

    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountKeyId: paidAccountKey.id,
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid key.',
      })
  })

  it('does not error if valid account key', async () => {
    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountKeyId: accountKey.id,
      })
      .expect(204)
  })

  it('returns error if description too long', async () => {
    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'd'.repeat(256),
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Description too long.',
      })
  })

  it('allows empty descriptions', async () => {
    await Promise.all(
      [undefined, null, '', ' '].map(async (description) => {
        await request(app.callback())
          .patch(`/webhooks/${webhook.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            ...(description !== undefined
              ? {
                  description,
                }
              : {}),
          })
          .expect(204)
      })
    )
  })

  it('returns error if empty URL', async () => {
    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        url: '',
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid URL.',
      })
  })

  it('returns error if invalid URL', async () => {
    for (const url of ['not_a_url', 'http://', 'https://', 'not_a_url.com']) {
      await request(app.callback())
        .patch(`/webhooks/${webhook.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          url,
        })
        .expect(400)
        .expect('Content-Type', /json/)
        .expect({
          error: 'Invalid URL.',
        })
    }
  })

  it('returns error if no filters', async () => {
    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        contractAddresses: [],
        codeIdSetIds: [],
        stateKey: null,
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'At least one filter is required.',
      })
  })

  it('validates code ID sets', async () => {
    await Promise.all(
      [[3], [3, codeIdSet.id]].map(async (codeIdSetIds) => {
        await request(app.callback())
          .patch(`/webhooks/${webhook.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            codeIdSetIds,
          })
          .expect(400)
          .expect('Content-Type', /json/)
          .expect({
            error: 'Invalid code ID sets.',
          })
      })
    )

    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        codeIdSetIds: [codeIdSet.id],
      })
      .expect(204)
  })

  it('validates state key', async () => {
    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        stateKey: 1,
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid state key.',
      })

    // Valid state keys.
    await Promise.all(
      [undefined, null, ' ', 'stateKey'].map(async (stateKey) => {
        await request(app.callback())
          .patch(`/webhooks/${webhook.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            stateKey,
          })
          .expect(204)
      })
    )
  })

  it('does not create webhook if no auth token', async () => {
    const initialWebhooks = await AccountWebhook.count()

    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .send({
        stateKey: 'new_stateKey',
      })
      .expect(401)

    // Verify webhook not created.
    expect(await AccountWebhook.count()).toBe(initialWebhooks)
  })

  it('resets secret', async () => {
    const initialSecret = webhook.secret

    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        resetSecret: true,
      })
      .expect(204)

    await webhook.reload()
    expect(webhook.secret).not.toBe(initialSecret)
  })

  it('updates the webhook', async () => {
    await request(app.callback())
      .patch(`/webhooks/${webhook.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'new test',
        url: 'https://new.example.com',
        codeIdSetIds: [],
        contractAddresses: ['junoContract1'],
        stateKey: 'aNewStateKey',
        stateKeyIsPrefix: true,
        onlyFirstSet: true,
      })
      .expect(204)

    await webhook.reload({
      include: AccountCodeIdSet,
    })

    expect(webhook.description).toBe('new test')
    expect(webhook.url).toBe('https://new.example.com')
    expect(webhook.codeIdSets.length).toBe(0)
    expect(webhook.contractAddresses).toEqual(['junoContract1'])
    expect(webhook.stateKey).toBe('aNewStateKey')
    expect(webhook.stateKeyIsPrefix).toBe(true)
    expect(webhook.onlyFirstSet).toBe(true)
  })
})
