import request from 'supertest'

import { Account, AccountCodeIdSet } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

describe('GET /code-id-sets', () => {
  let account: Account
  let token: string
  beforeEach(async () => {
    const { account: _account, token: _token } = await getAccountWithAuth()

    account = _account
    token = _token
  })

  it('returns error if no auth token', async () => {
    await request(app.callback())
      .get('/code-id-sets')
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'No token.',
      })
  })

  it('lists code ID sets', async () => {
    await account.$create('codeIdSet', {
      name: 'contract1',
      codeIds: [1, 50, 200],
    })
    await account.$create('codeIdSet', {
      name: 'contract2',
      codeIds: [4, 5, 6],
    })

    await account.reload({
      include: AccountCodeIdSet,
    })

    await request(app.callback())
      .get('/code-id-sets')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        codeIdSets: await Promise.all(
          account.codeIdSets.map((codeIdSet) => codeIdSet.apiJson)
        ),
      })
  })
})
