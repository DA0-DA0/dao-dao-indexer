import request from 'supertest'

import { Account, AccountKey } from '@/db'
import { GetSignedBody, getAccountWithSigner } from '@/test/utils'

import { app } from './app'

describe('POST /keys', () => {
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
      .post('/keys')
      .send({
        ...(await getSignedBody({})),
        signature: 'invalid',
      })
      .expect(401)
  })

  it('returns error if no name', async () => {
    await request(app.callback())
      .post('/keys')
      .send(await getSignedBody({}))
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Missing name.',
      })
  })

  it('returns error if empty name', async () => {
    await request(app.callback())
      .post('/keys')
      .send(
        await getSignedBody({
          name: ' ',
        })
      )
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Missing name.',
      })
  })

  it('returns error if name too long', async () => {
    await request(app.callback())
      .post('/keys')
      .send(
        await getSignedBody({
          name: 'n'.repeat(256),
        })
      )
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Name too long.',
      })
  })

  it('returns error if duplicate name', async () => {
    await request(app.callback())
      .post('/keys')
      .send(
        await getSignedBody({
          name: account.keys[0].name,
        })
      )
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Name already exists.',
      })
  })

  it('returns error if description too long', async () => {
    await request(app.callback())
      .post('/keys')
      .send(
        await getSignedBody({
          name: 'new key',
          description: 'd'.repeat(256),
        })
      )
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Description too long.',
      })
  })

  it('allows empty descriptions', async () => {
    let index = 0
    for (const description of [undefined, null, '', ' ']) {
      await request(app.callback())
        .post('/keys')
        .send(
          await getSignedBody({
            name: `new key ${index++}`,
            ...(description !== undefined
              ? {
                  description,
                }
              : {}),
          })
        )
        .expect(201)
        .expect('Content-Type', /json/)
    }
  })

  it('does not create key if invalid signature', async () => {
    const initialKeys = await AccountKey.count()

    await request(app.callback())
      .post('/keys')
      .send({
        ...(await getSignedBody({
          name: 'new key',
        })),
        signature: 'invalid',
      })
      .expect(401)

    // Verify key not created.
    expect(await AccountKey.count()).toBe(initialKeys)
  })

  it('creates a new key', async () => {
    const initialKeys = await AccountKey.count()

    const response = await request(app.callback())
      .post('/keys')
      .send(
        await getSignedBody({
          name: 'new key',
        })
      )
      .expect(201)
      .expect('Content-Type', /json/)

    // Verify response values.
    expect(response.body.apiKey).toBeTruthy()
    expect(response.body.createdKey).toBeTruthy()

    // Verify key was created correctly.
    expect(await AccountKey.count()).toBe(initialKeys + 1)
    expect(response.body.createdKey.name).toBe('new key')
    expect(AccountKey.hashKey(response.body.apiKey)).toBe(
      (await AccountKey.findOne({
        where: { name: response.body.createdKey.name },
      }))!.hashedKey
    )
  })
})
