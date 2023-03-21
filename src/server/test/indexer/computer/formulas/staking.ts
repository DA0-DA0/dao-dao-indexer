import request from 'supertest'

import { StakingSlashEvent, State, Validator } from '@/db'

import { app } from '../../app'
import { ComputerTestOptions } from '../types'

export const loadStakingTests = (options: ComputerTestOptions) => {
  describe('staking', () => {
    beforeEach(async () => {
      const validator1 = await Validator.create({
        operatorAddress: 'v1',
      })
      const validator2 = await Validator.create({
        operatorAddress: 'v2',
      })

      const date = new Date()
      await StakingSlashEvent.bulkCreate([
        {
          validatorOperatorAddress: validator1.operatorAddress,
          registeredBlockHeight: 3,
          registeredBlockTimeUnixMs: 3,
          registeredBlockTimestamp: date,
          infractionBlockHeight: 1,
          slashFactor: '0.25',
          amountSlashed: '25000000000000',
          effectiveFraction: '0.25',
          stakedTokensBurned: '25000000000000',
        },
        {
          validatorOperatorAddress: validator2.operatorAddress,
          registeredBlockHeight: 5,
          registeredBlockTimeUnixMs: 5,
          registeredBlockTimestamp: date,
          infractionBlockHeight: 4,
          slashFactor: '0.1',
          amountSlashed: '100000000000',
          effectiveFraction: '0.1',
          stakedTokensBurned: '100000000000',
        },
        {
          validatorOperatorAddress: validator1.operatorAddress,
          registeredBlockHeight: 10,
          registeredBlockTimeUnixMs: 10,
          registeredBlockTimestamp: date,
          infractionBlockHeight: 9,
          slashFactor: '0.2',
          amountSlashed: '15000000000000',
          effectiveFraction: '0.2',
          stakedTokensBurned: '15000000000000',
        },
      ])

      await (await State.getSingleton())!.update({
        latestBlockHeight: 10,
        latestBlockTimeUnixMs: 10,
      })
    })

    it('computes slashes', async () => {
      await request(app.callback())
        .get('/validator/v1/staking/slashes')
        .set('x-api-key', options.apiKey)
        .expect(200)
        .expect('Content-Type', /json/)
        .expect([
          {
            registeredBlockHeight: '10',
            registeredBlockTimeUnixMs: '10',
            infractionBlockHeight: '9',
            slashFactor: '0.2',
            amountSlashed: '15000000000000',
            effectiveFraction: '0.2',
            stakedTokensBurned: '15000000000000',
          },
          {
            registeredBlockHeight: '3',
            registeredBlockTimeUnixMs: '3',
            infractionBlockHeight: '1',
            slashFactor: '0.25',
            amountSlashed: '25000000000000',
            effectiveFraction: '0.25',
            stakedTokensBurned: '25000000000000',
          },
        ])
    })
  })
}
