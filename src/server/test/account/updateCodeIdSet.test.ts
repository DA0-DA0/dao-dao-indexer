import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { AccountCodeIdSet } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('PATCH /code-id-sets/:id', () => {
  let token: string
  let codeIdSet: AccountCodeIdSet
  beforeEach(async () => {
    const { account, token: _token } = await getAccountWithAuth()
    token = _token

    codeIdSet = await account.$create('codeIdSet', {
      name: 'contract',
      codeIds: [1, 50, 200],
    })
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .patch(`/code-id-sets/${codeIdSet.id}`)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('returns error if no code ID set', async () => {
    await request(app.callback())
      .patch(`/code-id-sets/${codeIdSet.id + 1}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Code ID set not found.',
      })
  })

  it('returns error if code ID set owned by another account', async () => {
    const { account: anotherAccount } = await getAccountWithAuth()
    const anotherCodeIdSet = await anotherAccount.$create('codeIdSet', {
      name: 'contract',
      codeIds: [1, 50, 200],
    })

    await request(app.callback())
      .patch(`/code-id-sets/${anotherCodeIdSet.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Code ID set not found.',
      })
  })

  it('returns error if invalid name', async () => {
    await Promise.all(
      [null, '', ' ', 1].map((name) =>
        request(app.callback())
          .patch(`/code-id-sets/${codeIdSet.id}`)
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
      .patch(`/code-id-sets/${codeIdSet.id}`)
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
        null,
        '',
        'invalid',
        1,
        ['invalid'],
        [1, 'invalid'],
        [1, undefined],
        [1, null],
        [1.5],
        [1, 1.5],
      ].map((codeIds) =>
        request(app.callback())
          .patch(`/code-id-sets/${codeIdSet.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
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

  it('does not update if no auth token', async () => {
    const initialName = codeIdSet.name
    const initialCodeIds = codeIdSet.codeIds

    await request(app.callback())
      .patch(`/code-id-sets/${codeIdSet.id}`)
      .send({
        name: 'new_' + initialName,
        codeIdSets: [...initialCodeIds, 1000],
      })
      .expect(401)

    // Verify not changed.
    await codeIdSet.reload()
    expect(codeIdSet.name).toBe(initialName)
    expect(codeIdSet.codeIds).toEqual(initialCodeIds)
  })

  it('updates the code ID set', async () => {
    const newName = 'new_' + codeIdSet.name
    const newCodeIds = [...codeIdSet.codeIds, 1000]

    await request(app.callback())
      .patch(`/code-id-sets/${codeIdSet.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: newName,
        codeIds: newCodeIds,
      })
      .expect(204)

    await codeIdSet.reload()
    expect(codeIdSet.name).toBe(newName)
    expect(codeIdSet.codeIds).toEqual(newCodeIds)
  })
})
