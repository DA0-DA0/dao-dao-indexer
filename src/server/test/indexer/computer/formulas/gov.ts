import request from 'supertest'

import { GovStateEvent, State } from '@/db'

import { app } from '../../app'
import { ComputerTestOptions } from '../types'

export const loadGovTests = (options: ComputerTestOptions) => {
  describe('gov', () => {
    describe('basic', () => {
      beforeEach(async () => {
        // Set up gov.
        const blockTimestamp = new Date()
        await GovStateEvent.bulkCreate([
          {
            proposalId: '1',
            blockHeight: 1,
            blockTimeUnixMs: 1,
            blockTimestamp,
            version: 'version',
            data: '1-1',
          },
          {
            proposalId: '1',
            blockHeight: 2,
            blockTimeUnixMs: 2,
            blockTimestamp,
            version: 'version',
            data: '1-2',
          },
          {
            proposalId: '2',
            blockHeight: 3,
            blockTimeUnixMs: 3,
            blockTimestamp,
            version: 'version',
            data: '2-3',
          },
          {
            proposalId: '3',
            blockHeight: 4,
            blockTimeUnixMs: 4,
            blockTimestamp,
            version: 'version',
            data: '3-4',
          },
        ])

        await (await State.getSingleton())!.update({
          latestBlockHeight: 4,
          latestBlockTimeUnixMs: 4,
          lastGovBlockHeightExported: 4,
        })
      })

      it('returns correct proposal response for a single block', async () => {
        await request(app.callback())
          .get('/generic/_/gov/proposal?block=1:1&proposalId=1')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect({
            id: '1',
            version: 'version',
            data: '1-1',
          })

        await request(app.callback())
          .get('/generic/_/gov/proposal?block=3:3&proposalId=1')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect({
            id: '1',
            version: 'version',
            data: '1-2',
          })

        // Returns latest if no block.
        await request(app.callback())
          .get('/generic/_/gov/proposal?proposalId=1')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect({
            id: '1',
            version: 'version',
            data: '1-2',
          })
      })

      it('returns correct proposal response for multiple blocks', async () => {
        await request(app.callback())
          .get('/generic/_/gov/proposal?blocks=1:1..3:3&proposalId=1')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect([
            {
              value: {
                id: '1',
                version: 'version',
                data: '1-1',
              },
              blockHeight: 1,
              blockTimeUnixMs: 1,
            },
            {
              value: {
                id: '1',
                version: 'version',
                data: '1-2',
              },
              blockHeight: 2,
              blockTimeUnixMs: 2,
            },
          ])

        await request(app.callback())
          .get(
            '/generic/_/gov/proposal?blocks=1:1..3:3&blockStep=2&proposalId=1'
          )
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect([
            {
              at: '1',
              value: {
                id: '1',
                version: 'version',
                data: '1-1',
              },
              blockHeight: 1,
              blockTimeUnixMs: 1,
            },
            {
              at: '3',
              value: {
                id: '1',
                version: 'version',
                data: '1-2',
              },
              blockHeight: 2,
              blockTimeUnixMs: 2,
            },
          ])
      })

      it('returns correct proposal response for multiple times', async () => {
        await request(app.callback())
          .get('/generic/_/gov/proposal?times=1..3&proposalId=1')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect([
            {
              value: {
                id: '1',
                version: 'version',
                data: '1-1',
              },
              blockHeight: 1,
              blockTimeUnixMs: 1,
            },
            {
              value: {
                id: '1',
                version: 'version',
                data: '1-2',
              },
              blockHeight: 2,
              blockTimeUnixMs: 2,
            },
          ])

        await request(app.callback())
          .get('/generic/_/gov/proposal?times=1..3&timeStep=2&proposalId=1')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect([
            {
              at: '1',
              value: {
                id: '1',
                version: 'version',
                data: '1-1',
              },
              blockHeight: 1,
              blockTimeUnixMs: 1,
            },
            {
              at: '3',
              value: {
                id: '1',
                version: 'version',
                data: '1-2',
              },
              blockHeight: 2,
              blockTimeUnixMs: 2,
            },
          ])
      })

      it('returns correct proposals response for a single block', async () => {
        await request(app.callback())
          .get('/generic/_/gov/proposals?block=1:1')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect({
            proposals: [
              {
                id: '1',
                version: 'version',
                data: '1-1',
              },
            ],
            total: 1,
          })

        await request(app.callback())
          .get('/generic/_/gov/proposals?block=3:3')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect({
            proposals: [
              {
                id: '1',
                version: 'version',
                data: '1-2',
              },
              {
                id: '2',
                version: 'version',
                data: '2-3',
              },
            ],
            total: 2,
          })

        // Returns latest if no block.
        await request(app.callback())
          .get('/generic/_/gov/proposals')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect({
            proposals: [
              {
                id: '1',
                version: 'version',
                data: '1-2',
              },
              {
                id: '2',
                version: 'version',
                data: '2-3',
              },
              {
                id: '3',
                version: 'version',
                data: '3-4',
              },
            ],
            total: 3,
          })
      })

      it('returns correct proposals response for multiple blocks', async () => {
        await request(app.callback())
          .get('/generic/_/gov/proposals?blocks=1:1..3:3')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect([
            {
              value: {
                proposals: [
                  {
                    id: '1',
                    version: 'version',
                    data: '1-1',
                  },
                ],
                total: 1,
              },
              blockHeight: 1,
              blockTimeUnixMs: 1,
            },
            {
              value: {
                proposals: [
                  {
                    id: '1',
                    version: 'version',
                    data: '1-2',
                  },
                ],
                total: 1,
              },
              blockHeight: 2,
              blockTimeUnixMs: 2,
            },
            {
              value: {
                proposals: [
                  {
                    id: '1',
                    version: 'version',
                    data: '1-2',
                  },
                  {
                    id: '2',
                    version: 'version',
                    data: '2-3',
                  },
                ],
                total: 2,
              },
              blockHeight: 3,
              blockTimeUnixMs: 3,
            },
          ])

        await request(app.callback())
          .get('/generic/_/gov/proposals?blocks=1:1..3:3&blockStep=2')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect([
            {
              at: '1',
              value: {
                proposals: [
                  {
                    id: '1',
                    version: 'version',
                    data: '1-1',
                  },
                ],
                total: 1,
              },
              blockHeight: 1,
              blockTimeUnixMs: 1,
            },
            {
              at: '3',
              value: {
                proposals: [
                  {
                    id: '1',
                    version: 'version',
                    data: '1-2',
                  },
                  {
                    id: '2',
                    version: 'version',
                    data: '2-3',
                  },
                ],
                total: 2,
              },
              blockHeight: 3,
              blockTimeUnixMs: 3,
            },
          ])
      })

      it('returns correct proposals response for multiple times', async () => {
        await request(app.callback())
          .get('/generic/_/gov/proposals?times=1..3')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect([
            {
              value: {
                proposals: [
                  {
                    id: '1',
                    version: 'version',
                    data: '1-1',
                  },
                ],
                total: 1,
              },
              blockHeight: 1,
              blockTimeUnixMs: 1,
            },
            {
              value: {
                proposals: [
                  {
                    id: '1',
                    version: 'version',
                    data: '1-2',
                  },
                ],
                total: 1,
              },
              blockHeight: 2,
              blockTimeUnixMs: 2,
            },
            {
              value: {
                proposals: [
                  {
                    id: '1',
                    version: 'version',
                    data: '1-2',
                  },
                  {
                    id: '2',
                    version: 'version',
                    data: '2-3',
                  },
                ],
                total: 2,
              },
              blockHeight: 3,
              blockTimeUnixMs: 3,
            },
          ])

        await request(app.callback())
          .get('/generic/_/gov/proposals?times=1..3&timeStep=2')
          .set('x-api-key', options.apiKey)
          .expect(200)
          .expect([
            {
              at: '1',
              value: {
                proposals: [
                  {
                    id: '1',
                    version: 'version',
                    data: '1-1',
                  },
                ],
                total: 1,
              },
              blockHeight: 1,
              blockTimeUnixMs: 1,
            },
            {
              at: '3',
              value: {
                proposals: [
                  {
                    id: '1',
                    version: 'version',
                    data: '1-2',
                  },
                  {
                    id: '2',
                    version: 'version',
                    data: '2-3',
                  },
                ],
                total: 2,
              },
              blockHeight: 3,
              blockTimeUnixMs: 3,
            },
          ])
      })
    })
  })
}
