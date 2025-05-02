import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { app } from './app'

describe('health', () => {
  it('returns ok', async () => {
    await request(app.callback())
      .get('/health')
      .expect(200)
      .expect({
        status: 'ok',
        timestamp: expect.any(String),
      })
  })
})
