import request from 'supertest'

import { AccountCodeIdSet } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('DELETE /code-id-sets/:id', () => {
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
      .delete(`/code-id-sets/${codeIdSet.id}`)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('returns error if code ID set does not exist', async () => {
    await request(app.callback())
      .delete(`/code-id-sets/${codeIdSet.id + 1}`)
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
      .delete(`/code-id-sets/${anotherCodeIdSet.id + 1}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Code ID set not found.',
      })
  })

  it('deletes code ID set', async () => {
    const initialCount = await AccountCodeIdSet.count()

    await request(app.callback())
      .delete(`/code-id-sets/${codeIdSet.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)

    expect(await AccountCodeIdSet.count()).toBe(initialCount - 1)
  })
})
