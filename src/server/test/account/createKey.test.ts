import request from 'supertest'

import { Account, AccountKey } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('POST /keys', () => {
  let account: Account
  let token: string
  beforeEach(async () => {
    const { account: _account, token: _token } = await getAccountWithAuth()

    account = _account
    token = _token
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .post('/keys')
      .send({})
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('returns error if no name', async () => {
    await request(app.callback())
      .post('/keys')
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
      .post('/keys')
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

  it('returns error if name too long', async () => {
    await request(app.callback())
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'n'.repeat(256),
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Name too long.',
      })
  })

  it('returns error if duplicate name', async () => {
    await request(app.callback())
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: account.keys[0].name,
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Name already exists.',
      })
  })

  it('returns error if description too long', async () => {
    await request(app.callback())
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'new key',
        description: 'd'.repeat(256),
      })
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
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `new key ${index++}`,
          ...(description !== undefined
            ? {
                description,
              }
            : {}),
        })
        .expect(201)
        .expect('Content-Type', /json/)
    }
  })

  it('does not create key if no auth token', async () => {
    const initialKeys = await AccountKey.count()

    await request(app.callback())
      .post('/keys')
      .send({
        name: 'new key',
      })
      .expect(401)

    // Verify key not created.
    expect(await AccountKey.count()).toBe(initialKeys)
  })

  it('creates a new key', async () => {
    const initialKeys = await AccountKey.count()

    const response = await request(app.callback())
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'new key',
      })
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
