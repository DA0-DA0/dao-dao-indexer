import request from 'supertest'

import { AccountCodeIdSet } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('POST /code-id-sets', () => {
  let token: string
  beforeEach(async () => {
    const { token: _token } = await getAccountWithAuth()
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .post('/code-id-sets')
      .send({})
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('returns error if invalid name', async () => {
    await Promise.all(
      [undefined, null, '', ' ', 1].map((name) =>
        request(app.callback())
          .post('/code-id-sets')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name,
          })
          .expect(400)
          .expect('Content-Type', /json/)
          .expect({
            error: 'Invalid name.',
          })
      )
    )
  })

  it('returns error if name too long', async () => {
    await request(app.callback())
      .post('/code-id-sets')
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

  it('returns error if invalid code IDs', async () => {
    await Promise.all(
      [
        undefined,
        null,
        '',
        'invalid',
        1,
        ['invalid'],
        [1, 'invalid'],
        [1, undefined],
        [1, null],
      ].map((codeIds) =>
        request(app.callback())
          .post('/code-id-sets')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'name',
            codeIds,
          })
          .expect(400)
          .expect('Content-Type', /json/)
          .expect({
            error: 'Invalid code IDs.',
          })
      )
    )
  })

  it('does not create code ID set if no auth token', async () => {
    const initialCount = await AccountCodeIdSet.count()

    await request(app.callback())
      .post('/code-id-sets')
      .send({
        name: 'name',
        codeIds: [1, 2, 3],
      })
      .expect(401)

    // Verify not created.
    expect(await AccountCodeIdSet.count()).toBe(initialCount)
  })

  it('creates a new code ID set', async () => {
    const initialCount = await AccountCodeIdSet.count()

    await request(app.callback())
      .post('/code-id-sets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'name',
        codeIds: [1, 2, 3],
      })
      .expect(201)

    // Verify created correctly.
    expect(await AccountCodeIdSet.count()).toBe(initialCount + 1)

    const codeIdSet = await AccountCodeIdSet.findOne()
    expect(codeIdSet).not.toBeNull()
    expect(codeIdSet!.name).toBe('name')
    expect(codeIdSet!.codeIds).toEqual([1, 2, 3])
  })
})
