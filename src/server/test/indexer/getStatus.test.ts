import request from 'supertest'

import { State } from '@/db'
import { serializeBlock } from '@/utils'

import { app } from './app'

describe('GET /status', () => {
  it('returns the status', async () => {
    const state = await State.getSingleton()
    expect(state).toBeDefined()

    await request(app.callback())
      .get('/status')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        latestBlock: serializeBlock(state!.latestBlock),
        lastStakingBlockHeightExported:
          state!.lastStakingBlockHeightExported?.toString() || null,
        lastWasmBlockHeightExported:
          state!.lastWasmBlockHeightExported?.toString() || null,
        lastBankBlockHeightExported:
          state!.lastBankBlockHeightExported?.toString() || null,
        lastGovBlockHeightExported:
          state!.lastGovBlockHeightExported?.toString() || null,
        lastDistributionBlockHeightExported:
          state!.lastDistributionBlockHeightExported?.toString() || null,
      })
  })
})
