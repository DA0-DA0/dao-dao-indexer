import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  Account,
  AccountCodeIdSet,
  AccountWebhook,
  AccountWebhookEvent,
  AccountWebhookEventAttempt,
} from '@/db'
import { createWebhookWithEvents, getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('POST /webhooks/:id/events/:uuid/fire', () => {
  let account: Account
  let token: string
  let webhook: AccountWebhook
  let event: AccountWebhookEvent
  beforeEach(async () => {
    const {
      account: _account,
      paidAccountKey,
      token: _token,
    } = await getAccountWithAuth()

    account = _account
    token = _token

    webhook = await createWebhookWithEvents(account, paidAccountKey)
    event = webhook.events[0]

    await account.reload({
      include: {
        model: AccountWebhook,
        include: [
          {
            model: AccountWebhookEvent,
          },
          {
            model: AccountCodeIdSet,
          },
        ],
      },
    })
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .post(`/webhooks/${webhook.id}/events/${event.uuid}/fire`)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('returns error if no webhook', async () => {
    await request(app.callback())
      .post('/webhooks/100/events/invalid/fire')
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Webhook event not found.',
      })
  })

  it('returns error if no webhook event', async () => {
    await request(app.callback())
      .post(`/webhooks/${webhook.id}/events/invalid/fire`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Webhook event not found.',
      })
  })

  it('returns error if webhook not owned by this account', async () => {
    const { account: anotherAccount, paidAccountKey } =
      await getAccountWithAuth()
    const anotherWebhook = await createWebhookWithEvents(
      anotherAccount,
      paidAccountKey
    )

    await request(app.callback())
      .post(
        `/webhooks/${anotherWebhook.id}/events/${anotherWebhook.events[0].uuid}/fire`
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Webhook event not found.',
      })
  })

  it('fires webhook event', async () => {
    const response = await request(app.callback())
      .post(`/webhooks/${webhook.id}/events/${event.uuid}/fire`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /json/)

    // Get most recent attempt for the event.
    const attempt = (
      await event.$get('attempts', {
        order: [['createdAt', 'DESC']],
      })
    )[0]

    // Verify response.
    expect(response.body).toEqual({
      attempt: attempt.apiJson,
    })
  })

  it('requires 30 seconds between webhook event firings', async () => {
    expect((await event.$get('attempts')).length).toBe(0)

    // Fire once.
    await request(app.callback())
      .post(`/webhooks/${webhook.id}/events/${event.uuid}/fire`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /json/)

    expect((await event.$get('attempts')).length).toBe(1)

    // Immediately fire again and expect failure.
    const response = await request(app.callback())
      .post(`/webhooks/${webhook.id}/events/${event.uuid}/fire`)
      .set('Authorization', `Bearer ${token}`)
      .expect(429)
      .expect('Content-Type', /json/)

    expect(response.body.error).toMatch(
      /You can only fire a webhook once every 30 seconds. You can fire again in \d\d seconds./
    )
    const attempts = await event.$get('attempts')
    expect(attempts.length).toBe(1)

    // "Wait 30 seconds" by moving the attempt's createdAt date back 31 seconds.
    // Need to use the model update method instead of the attempt instance
    // update method directly because Sequelize doesn't let us update the
    // createdAt field on the instance.
    await AccountWebhookEventAttempt.update(
      {
        createdAt: new Date(Date.now() - 31 * 1000),
      },
      {
        where: {
          id: attempts[0].id,
        },
      }
    )

    // Fire again and expect success.
    await request(app.callback())
      .post(`/webhooks/${webhook.id}/events/${event.uuid}/fire`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /json/)

    expect((await event.$get('attempts')).length).toBe(2)
  })
})
