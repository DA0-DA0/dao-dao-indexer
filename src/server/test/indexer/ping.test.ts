import request from 'supertest'

import { app } from './app'

describe('ping', () => {
  it('returns pong', async () => {
    await request(app.callback()).get('/ping').expect(200).expect('pong')
  })
})
