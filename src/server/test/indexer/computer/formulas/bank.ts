import request from 'supertest'

import { BankStateEvent, State } from '@/db'

import { app } from '../../app'
import { ComputerTestOptions } from '../types'

export const loadBankTests = (options: ComputerTestOptions) => {
  describe('bank', () => {
    beforeEach(async () => {
      // Set up bank.
      const blockTimestamp = new Date()
      await BankStateEvent.bulkCreate([
        {
          address: 'address',
          denom: 'utest',
          blockHeight: 1,
          blockTimeUnixMs: 1,
          blockTimestamp,
          balance: '1000',
        },
        {
          address: 'address',
          denom: 'utest',
          blockHeight: 2,
          blockTimeUnixMs: 2,
          blockTimestamp,
          balance: '2000',
        },
        {
          address: 'address',
          denom: 'uanother',
          blockHeight: 3,
          blockTimeUnixMs: 3,
          blockTimestamp,
          balance: '3000',
        },
        {
          address: 'address',
          denom: 'uagain',
          blockHeight: 4,
          blockTimeUnixMs: 4,
          blockTimestamp,
          balance: '4000',
        },
      ])

      await (await State.getSingleton())!.update({
        latestBlockHeight: 4,
        latestBlockTimeUnixMs: 4,
        lastBankBlockHeightExported: 4,
      })
    })

    it('returns correct balance response for a single block', async () => {
      await request(app.callback())
        .get('/wallet/address/bank/balance?block=1:1&denom=utest')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect('"1000"')

      await request(app.callback())
        .get('/wallet/address/bank/balance?block=3:3&denom=utest')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect('"2000"')

      // Returns latest if no block.
      await request(app.callback())
        .get('/wallet/address/bank/balance?denom=utest')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect('"2000"')
    })

    it('returns correct balance response for multiple blocks', async () => {
      await request(app.callback())
        .get('/wallet/address/bank/balance?blocks=1:1..3:3&denom=utest')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect([
          {
            value: '1000',
            blockHeight: 1,
            blockTimeUnixMs: 1,
          },
          {
            value: '2000',
            blockHeight: 2,
            blockTimeUnixMs: 2,
          },
        ])

      await request(app.callback())
        .get(
          '/wallet/address/bank/balance?blocks=1:1..3:3&blockStep=2&denom=utest'
        )
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect([
          {
            at: '1',
            value: '1000',
            blockHeight: 1,
            blockTimeUnixMs: 1,
          },
          {
            at: '3',
            value: '2000',
            blockHeight: 2,
            blockTimeUnixMs: 2,
          },
        ])
    })

    it('returns correct balance response for multiple times', async () => {
      await request(app.callback())
        .get('/wallet/address/bank/balance?times=1..3&denom=utest')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect([
          {
            value: '1000',
            blockHeight: 1,
            blockTimeUnixMs: 1,
          },
          {
            value: '2000',
            blockHeight: 2,
            blockTimeUnixMs: 2,
          },
        ])

      await request(app.callback())
        .get('/wallet/address/bank/balance?times=1..3&timeStep=2&denom=utest')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect([
          {
            at: '1',
            value: '1000',
            blockHeight: 1,
            blockTimeUnixMs: 1,
          },
          {
            at: '3',
            value: '2000',
            blockHeight: 2,
            blockTimeUnixMs: 2,
          },
        ])
    })

    it('returns correct balances response for a single block', async () => {
      await request(app.callback())
        .get('/wallet/address/bank/balances?block=1:1')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect({
          utest: '1000',
        })

      await request(app.callback())
        .get('/wallet/address/bank/balances?block=3:3')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect({
          utest: '2000',
          uanother: '3000',
        })

      // Returns latest if no block.
      await request(app.callback())
        .get('/wallet/address/bank/balances')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect({
          utest: '2000',
          uanother: '3000',
          uagain: '4000',
        })
    })

    it('returns correct balances response for multiple blocks', async () => {
      await request(app.callback())
        .get('/wallet/address/bank/balances?blocks=1:1..3:3')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect([
          {
            value: {
              utest: '1000',
            },
            blockHeight: 1,
            blockTimeUnixMs: 1,
          },
          {
            value: {
              utest: '2000',
            },
            blockHeight: 2,
            blockTimeUnixMs: 2,
          },
          {
            value: {
              utest: '2000',
              uanother: '3000',
            },
            blockHeight: 3,
            blockTimeUnixMs: 3,
          },
        ])

      await request(app.callback())
        .get('/wallet/address/bank/balances?blocks=1:1..3:3&blockStep=2')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect([
          {
            at: '1',
            value: {
              utest: '1000',
            },
            blockHeight: 1,
            blockTimeUnixMs: 1,
          },
          {
            at: '3',
            value: {
              utest: '2000',
              uanother: '3000',
            },
            blockHeight: 3,
            blockTimeUnixMs: 3,
          },
        ])
    })

    it('returns correct balances response for multiple times', async () => {
      await request(app.callback())
        .get('/wallet/address/bank/balances?times=1..3')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect([
          {
            value: {
              utest: '1000',
            },
            blockHeight: 1,
            blockTimeUnixMs: 1,
          },
          {
            value: {
              utest: '2000',
            },
            blockHeight: 2,
            blockTimeUnixMs: 2,
          },
          {
            value: {
              utest: '2000',
              uanother: '3000',
            },
            blockHeight: 3,
            blockTimeUnixMs: 3,
          },
        ])

      await request(app.callback())
        .get('/wallet/address/bank/balances?times=1..3&timeStep=2')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect([
          {
            at: '1',
            value: {
              utest: '1000',
            },
            blockHeight: 1,
            blockTimeUnixMs: 1,
          },
          {
            at: '3',
            value: {
              utest: '2000',
              uanother: '3000',
            },
            blockHeight: 3,
            blockTimeUnixMs: 3,
          },
        ])
    })
  })
}
