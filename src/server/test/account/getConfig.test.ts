import request from 'supertest'

import { app } from './app'

describe('GET /config', () => {
  it('returns the config', async () => {
    await request(app.callback())
      .get('/config')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        config: {
          cwReceiptPaymentAddress: 'cwReceiptAddress',
          nativeDenomAccepted: 'nativeDenomAccepted',
          creditScaleFactor: 50,
        },
      })
  })
})
