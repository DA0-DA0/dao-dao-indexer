import request from 'supertest'

import { app } from './app'

describe('docs', () => {
  it('OpenAPI JSON file exists', async () => {
    await request(app.callback())
      .get('/openapi.json')
      .expect(200)
      .expect('Content-Type', /json/)
  })

  it('renders', async () => {
    await request(app.callback()).get('/docs').expect(200)
  })
})
