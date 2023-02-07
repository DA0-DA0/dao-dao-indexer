import request from 'supertest'

import { app } from './app'

describe('GET /ping', () => {
  it('returns pong', async () => {
    await request(app.callback()).get('/ping').expect(200).expect('pong')
  })
})
