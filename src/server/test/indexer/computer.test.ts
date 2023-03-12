import request from 'supertest'

import { loadConfig } from '@/core/config'
import { ContractFormula, FormulaType, TypedFormula } from '@/core/types'
import { FormulaTypeValues, dbKeyForKeys } from '@/core/utils'
import { AccountKeyCredit, Computation, Contract, State, WasmEvent } from '@/db'
import { getTypedFormula } from '@/test/mocks'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

const mockFormula = (formula?: Partial<ContractFormula>) =>
  getTypedFormula.mockImplementation((type: FormulaType, name: string) => {
    if (name === 'invalid') {
      throw new Error(`Formula not found: ${name}`)
    }

    return {
      name,
      type,
      formula: {
        compute: async () => '',
        ...formula,
      },
    } as TypedFormula
  })

describe('computer: GET /(.*)', () => {
  let apiKey: string
  let credit: AccountKeyCredit
  beforeEach(async () => {
    const { paidApiKey, paidCredit } = await getAccountWithAuth()
    apiKey = paidApiKey
    credit = paidCredit

    await Contract.create({ address: 'valid_contract', codeId: 1 })

    mockFormula()
  })

  afterEach(async () => {
    getTypedFormula.mockReset()
  })

  it('requires at least 3 parameters', async () => {
    await request(app.callback())
      .get('/just_one')
      .expect(400)
      .expect('missing required parameters')

    await request(app.callback())
      .get('/two/params')
      .expect(400)
      .expect('missing required parameters')

    const response = await request(app.callback()).get('/three/params/here')
    expect(response.text).not.toBe('missing required parameters')
  })

  it('validates type', async () => {
    await request(app.callback())
      .get('/no/type/here')
      .expect(400)
      .expect('type must be one of: contract, wallet, generic')

    // All types should be valid.
    await Promise.all(
      Object.values(FormulaTypeValues).map(async (type) => {
        // Test valid when API key in header.
        const { text: text1 } = await request(app.callback())
          .get(`/${type}/no/params`)
          .set('x-api-key', apiKey)
        expect(text1).not.toBe('type must be one of: contract, wallet, generic')

        // Test valid when API key in path.
        const { text: text2 } = await request(app.callback()).get(
          `/${apiKey}/${type}/no/params`
        )
        expect(text2).not.toBe('type must be one of: contract, wallet, generic')
      })
    )
  })

  it('validates API key in header', async () => {
    await request(app.callback())
      .get('/contract/address/formula')
      .expect(401)
      .expect('missing API key')

    await request(app.callback())
      .get('/contract/address/formula')
      .set('x-api-key', '')
      .expect(401)
      .expect('missing API key')

    await request(app.callback())
      .get('/contract/address/formula')
      .set('x-api-key', 'invalid')
      .expect(401)
      .expect('invalid API key')

    const response = await request(app.callback())
      .get('/contract/address/formula')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe('missing API key')
    expect(response.text).not.toBe('invalid API key')
  })

  it('validates API key in path', async () => {
    await request(app.callback())
      .get('//contract/address/formula')
      .expect(401)
      .expect('missing API key')

    await request(app.callback())
      .get('/invalid/contract/address/formula')
      .expect(401)
      .expect('invalid API key')

    const response = await request(app.callback()).get(
      `/${apiKey}/contract/address/formula`
    )
    expect(response.text).not.toBe('missing API key')
    expect(response.text).not.toBe('invalid API key')
  })

  it('validates address', async () => {
    await request(app.callback())
      .get('/contract//formula')
      .set('x-api-key', apiKey)
      .expect(400)
      .expect('missing address')

    const response = await request(app.callback())
      .get('/contract/address/formula')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe('missing address')
  })

  it('validates formula', async () => {
    await request(app.callback())
      .get('/contract/address/')
      .set('x-api-key', apiKey)
      .expect(400)
      .expect('missing formula')

    const response = await request(app.callback())
      .get('/contract/address/formula')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe('missing formula')
  })

  it('validates block', async () => {
    await request(app.callback())
      .get('/contract/address/formula?block=invalid')
      .set('x-api-key', apiKey)
      .expect(400)
      .expect("block's values must be integers")

    await request(app.callback())
      .get('/contract/address/formula?block=1:1:1')
      .set('x-api-key', apiKey)
      .expect(400)
      .expect('block must be a height:timeUnixMs pair')

    await Promise.all(
      ['0:-1', '1:-1', '0:0'].map(async (block) => {
        await request(app.callback())
          .get(`/contract/address/formula?block=${block}`)
          .set('x-api-key', apiKey)
          .expect(400)
          .expect(
            "block's height must be at least 1 and block's timeUnixMs must be at least 0"
          )
      })
    )

    const response = await request(app.callback())
      .get('/contract/address/formula?block=1:0')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe(
      "block's height must be at least 1 and block's timeUnixMs must be at least 0"
    )
  })

  it('validates blocks', async () => {
    await request(app.callback())
      .get('/contract/address/formula?blocks=invalid')
      .set('x-api-key', apiKey)
      .expect(400)
      .expect('blocks must be a range of two blocks')

    await Promise.all(
      ['the start block', 'the end block'].map(async (subject, index) => {
        await request(app.callback())
          .get(
            `/contract/address/formula?blocks=${
              index === 0 ? 'invalid..1:0' : '1:0..invalid'
            }`
          )
          .set('x-api-key', apiKey)
          .expect(400)
          .expect(`${subject}'s values must be integers`)

        await request(app.callback())
          .get(
            `/contract/address/formula?blocks=${
              index === 0 ? '1:1:1..1:0' : '1:0..1:1:1'
            }`
          )
          .set('x-api-key', apiKey)
          .expect(400)
          .expect(`${subject} must be a height:timeUnixMs pair`)

        await Promise.all(
          ['0:-1', '1:-1', '0:0'].map(async (block) => {
            await request(app.callback())
              .get(
                `/contract/address/formula?blocks=${
                  index === 0 ? `${block}..1:0` : `1:0..${block}`
                }`
              )
              .set('x-api-key', apiKey)
              .expect(400)
              .expect(
                `${subject}'s height must be at least 1 and ${subject}'s timeUnixMs must be at least 0`
              )
          })
        )

        const response = await request(app.callback())
          .get('/contract/address/formula?blocks=1:0..1:0')
          .set('x-api-key', apiKey)
        expect(response.text).not.toBe(
          `${subject}'s height must be at least 1 and ${subject}'s timeUnixMs must be at least 0`
        )
      })
    )

    await Promise.all(
      [
        '2:2..1:1',
        '2:1..1:1',
        '1:2..1:1',
        '1:1..1:1',
        '1:1..1:2',
        '1:1..2:1',
      ].map(async (blocks) => {
        await request(app.callback())
          .get(`/contract/address/formula?blocks=${blocks}`)
          .set('x-api-key', apiKey)
          .expect(400)
          .expect('the start block must be before the end block')
      })
    )

    const response = await request(app.callback())
      .get('/contract/address/formula?blocks=1:1..2:2')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe(
      'the start block must be before the end block'
    )
  })

  it('validates block step', async () => {
    await Promise.all(
      ['invalid', '0', '-1', '-1.5', '1.5'].map(async (blockStep) => {
        await request(app.callback())
          .get(
            `/contract/address/formula?blocks=1:1..2:2&blockStep=${blockStep}`
          )
          .set('x-api-key', apiKey)
          .expect(400)
          .expect('block step must be a positive integer')
      })
    )

    const response = await request(app.callback())
      .get('/contract/address/formula?blocks=1:1..2:2&blockStep=1')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe('block step must be a positive integer')
  })

  it('validates time', async () => {
    await Promise.all(
      ['invalid', '-1', '-1.5', '1.5'].map(async (time) => {
        await request(app.callback())
          .get(`/contract/address/formula?time=${time}`)
          .set('x-api-key', apiKey)
          .expect(400)
          .expect('time must be an integer greater than or equal to zero')
      })
    )

    const response = await request(app.callback())
      .get('/contract/address/formula?time=0')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe(
      'time must be an integer greater than or equal to zero'
    )
  })

  it('validates times', async () => {
    await Promise.all(
      ['invalid', 'invalid..1', '1..invalid', '1.5', '1..1.5', '1.5..1'].map(
        async (times) => {
          await request(app.callback())
            .get(`/contract/address/formula?times=${times}`)
            .set('x-api-key', apiKey)
            .expect(400)
            .expect('times must be integers')
        }
      )
    )

    await Promise.all(
      ['-1..-2', '-1..-1', '1..1', '2..1'].map(async (times) => {
        await request(app.callback())
          .get(`/contract/address/formula?times=${times}`)
          .set('x-api-key', apiKey)
          .expect(400)
          .expect('the start time must be less than the end time')
      })
    )

    await Promise.all(
      ['-2..-1', '1..2'].map(async (times) => {
        const response = await request(app.callback())
          .get(`/contract/address/formula?times=${times}`)
          .set('x-api-key', apiKey)
        expect(response.text).not.toBe(
          'the start time must be less than the end time'
        )
      })
    )
  })

  it('validates time step', async () => {
    await Promise.all(
      ['invalid', '0', '-1', '-1.5', '1.5'].map(async (times) => {
        await request(app.callback())
          .get(`/contract/address/formula?times=1..2&timeStep=${times}`)
          .set('x-api-key', apiKey)
          .expect(400)
          .expect('time step must be a positive integer')
      })
    )

    const response = await request(app.callback())
      .get('/contract/address/formula?times=1..2&timeStep=1')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe('time step must be a positive integer')
  })

  it('validates formula exists', async () => {
    // Invalid formula throws error, defined in mock.
    await request(app.callback())
      .get('/contract/address/invalid')
      .set('x-api-key', apiKey)
      .expect(404)
      .expect('formula not found')

    await Promise.all(
      [FormulaType.Contract, FormulaType.Wallet, FormulaType.Generic].map(
        async (type) => {
          const response = await request(app.callback())
            .get(`/${type}/address/formula`)
            .set('x-api-key', apiKey)
          expect(response.text).not.toBe('formula not found')
        }
      )
    )
  })

  it('validates contract exists for contract formula', async () => {
    await request(app.callback())
      .get('/contract/address/formula')
      .set('x-api-key', apiKey)
      .expect(404)
      .expect('contract not found')

    const response = await request(app.callback())
      .get('/contract/valid_contract/formula')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe('contract not found')
  })

  it('filters contract by code IDs specified in formula', async () => {
    loadConfig().codeIds = {
      'dao-core': [1, 2],
    }
    mockFormula({
      filter: {
        codeIdsKeys: ['not-dao-core'],
      },
    })
    await request(app.callback())
      .get('/contract/valid_contract/some_formula')
      .set('x-api-key', apiKey)
      .expect(405)
      .expect(
        'the some_formula formula does not apply to contract valid_contract'
      )

    mockFormula({
      filter: {
        codeIdsKeys: ['dao-core'],
      },
    })
    const response = await request(app.callback())
      .get('/contract/valid_contract/some_formula')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe(
      'the some_formula formula does not apply to contract valid_contract'
    )
  })

  it('prevents dynamic formula from being computed over range', async () => {
    mockFormula({
      dynamic: true,
    })
    await request(app.callback())
      .get('/contract/valid_contract/formula?blocks=1:1..2:2')
      .set('x-api-key', apiKey)
      .expect(400)
      .expect(
        'cannot compute dynamic formula over a range (compute it for a specific block/time instead)'
      )

    mockFormula({
      dynamic: true,
    })
    await request(app.callback())
      .get('/contract/valid_contract/formula?times=1..2')
      .set('x-api-key', apiKey)
      .expect(400)
      .expect(
        'cannot compute dynamic formula over a range (compute it for a specific block/time instead)'
      )

    mockFormula({
      dynamic: false,
    })
    const response = await request(app.callback())
      .get('/contract/valid_contract/formula?blocks=1:1..2:2')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe(
      'cannot compute dynamic formula over a range (compute it for a specific block/time instead)'
    )
  })

  describe('event data available', () => {
    beforeEach(async () => {
      const date = new Date()
      await WasmEvent.bulkCreate([
        {
          contractAddress: 'valid_contract',
          blockHeight: 1,
          blockTimeUnixMs: 1,
          blockTimestamp: date,
          key: dbKeyForKeys('some_state'),
          value: '{"key1":"value1", "key2": "value2"}',
          valueJson: { key1: 'value1', key2: 'value2' },
          delete: false,
        },
        {
          contractAddress: 'valid_contract',
          blockHeight: 2,
          blockTimeUnixMs: 2,
          blockTimestamp: new Date(date.getTime() + 1000),
          key: dbKeyForKeys('some_state'),
          value: '',
          valueJson: null,
          delete: true,
        },
        {
          contractAddress: 'valid_contract',
          blockHeight: 3,
          blockTimeUnixMs: 3,
          blockTimestamp: new Date(date.getTime() + 2000),
          key: dbKeyForKeys('some_state'),
          value: '{"key3":"value3"}',
          valueJson: { key3: 'value3' },
          delete: false,
        },
      ])

      await (await State.getSingleton())!.update({
        latestBlockHeight: 3,
        latestBlockTimeUnixMs: 3,
        lastBlockHeightExported: 3,
      })

      mockFormula({
        compute: (env) => env.get(env.contractAddress, 'some_state'),
      })
    })

    it('uses 1 credit to query a single block', async () => {
      expect(credit.used).toBe('0')
      expect(credit.hits).toBe('0')

      // Returns latest if no block.
      await request(app.callback())
        .get('/contract/valid_contract/formula')
        .set('x-api-key', apiKey)
        .expect(200)

      await credit.reload()
      expect(credit.used).toBe('1')
      expect(credit.hits).toBe('1')

      await request(app.callback())
        .get('/contract/valid_contract/formula?block=1:1')
        .set('x-api-key', apiKey)
        .expect(200)

      await credit.reload()
      expect(credit.used).toBe('2')
      expect(credit.hits).toBe('2')
    })

    it('uses 1 credit to query a single time', async () => {
      expect(credit.used).toBe('0')
      expect(credit.hits).toBe('0')

      await request(app.callback())
        .get('/contract/valid_contract/formula?time=1')
        .set('x-api-key', apiKey)
        .expect(200)

      await credit.reload()
      expect(credit.used).toBe('1')
      expect(credit.hits).toBe('1')
    })

    it('errors when insufficient credits for a single block', async () => {
      expect(credit.used).toBe('0')
      expect(credit.hits).toBe('0')

      // Use all the credits.
      for (const _ of Array(Number(credit.amount))) {
        await request(app.callback())
          .get('/contract/valid_contract/formula')
          .set('x-api-key', apiKey)
          .expect(200)
      }

      await credit.reload()
      expect(credit.used).toBe(credit.amount)
      expect(credit.hits).toBe(credit.amount)

      await request(app.callback())
        .get('/contract/valid_contract/formula')
        .set('x-api-key', apiKey)
        .expect(402)
        .expect('insufficient credits')

      // Ensure no credits were used.
      await credit.reload()
      expect(credit.used).toBe(credit.amount)
      expect(credit.hits).toBe(credit.amount)
    })

    it('returns correct formula response for a single block', async () => {
      await request(app.callback())
        .get('/contract/valid_contract/formula?block=1:1')
        .set('x-api-key', apiKey)
        .expect(200)
        .expect({ key1: 'value1', key2: 'value2' })

      // 204 with no body since the value was deleted in this block.
      await request(app.callback())
        .get('/contract/valid_contract/formula?block=2:2')
        .set('x-api-key', apiKey)
        .expect(204)
        .expect('')

      await request(app.callback())
        .get('/contract/valid_contract/formula?block=3:3')
        .set('x-api-key', apiKey)
        .expect(200)
        .expect({ key3: 'value3' })

      // Returns latest if no block.
      await request(app.callback())
        .get('/contract/valid_contract/formula')
        .set('x-api-key', apiKey)
        .expect(200)
        .expect({ key3: 'value3' })
    })

    it('caches computation and uses it in the future', async () => {
      const initialComputations = await Computation.count()

      const response = await request(app.callback())
        .get('/contract/valid_contract/formula')
        .set('x-api-key', apiKey)
        .expect(200)

      expect(await Computation.count()).toBe(initialComputations + 1)

      // Computation should cache the returned result.
      const computation = (await Computation.getLast())!
      expect(computation.targetAddress).toBe('valid_contract')
      expect(computation.blockHeight).toBe('3')
      expect(computation.blockTimeUnixMs).toBe('3')
      expect(computation.latestBlockHeightValid).toBe('3')
      expect(computation.validityExtendable).toBe(true)
      expect(computation.type).toBe(FormulaType.Contract)
      expect(computation.formula).toBe('formula')
      expect(computation.args).toBe('{}')
      expect(computation.dependencies.length).toBe(1)
      expect(computation.dependencies[0].key).toEqual(
        `wasm_e:valid_contract:${dbKeyForKeys('some_state')}`
      )
      expect(computation.dependencies[0].prefix).toBe(false)
      expect(computation.output).toEqual(JSON.stringify(response.body))

      // Repeating the same query should not create a new computation.
      await request(app.callback())
        .get('/contract/valid_contract/formula')
        .set('x-api-key', apiKey)
        .expect(200)

      expect(await Computation.count()).toBe(initialComputations + 1)
    })

    it('uses 2 credits to query 3 blocks', async () => {
      expect(credit.used).toBe('0')
      expect(credit.hits).toBe('0')

      await request(app.callback())
        .get('/contract/valid_contract/formula?blocks=1:1..3:3')
        .set('x-api-key', apiKey)
        .expect(200)

      await credit.reload()
      expect(credit.used).toBe('2')
      expect(credit.hits).toBe('1')
    })

    it('uses 2 credits to query 3 blocks via times', async () => {
      expect(credit.used).toBe('0')
      expect(credit.hits).toBe('0')

      await request(app.callback())
        .get('/contract/valid_contract/formula?times=1..3')
        .set('x-api-key', apiKey)
        .expect(200)

      await credit.reload()
      expect(credit.used).toBe('2')
      expect(credit.hits).toBe('1')
    })

    it('errors when insufficient credits for a blocks/times range', async () => {
      expect(credit.used).toBe('0')
      expect(credit.hits).toBe('0')

      // Use all the credits.
      for (const _ of Array(Number(credit.amount))) {
        await request(app.callback())
          .get('/contract/valid_contract/formula')
          .set('x-api-key', apiKey)
          .expect(200)
      }

      await credit.reload()
      expect(credit.used).toBe(credit.amount)
      expect(credit.hits).toBe(credit.amount)

      await request(app.callback())
        .get('/contract/valid_contract/formula?blocks=1:1..3:3')
        .set('x-api-key', apiKey)
        .expect(402)
        .expect('insufficient credits')

      // Ensure no credits were used.
      await credit.reload()
      expect(credit.used).toBe(credit.amount)
      expect(credit.hits).toBe(credit.amount)

      await request(app.callback())
        .get('/contract/valid_contract/formula?times=1')
        .set('x-api-key', apiKey)
        .expect(402)
        .expect('insufficient credits')

      // Ensure no credits were used.
      await credit.reload()
      expect(credit.used).toBe(credit.amount)
      expect(credit.hits).toBe(credit.amount)

      await request(app.callback())
        .get('/contract/valid_contract/formula?times=1..3')
        .set('x-api-key', apiKey)
        .expect(402)
        .expect('insufficient credits')

      // Ensure no credits were used.
      await credit.reload()
      expect(credit.used).toBe(credit.amount)
      expect(credit.hits).toBe(credit.amount)
    })

    it('returns correct formula response for 3 blocks', async () => {
      await request(app.callback())
        .get('/contract/valid_contract/formula?blocks=1:1..3:3')
        .set('x-api-key', apiKey)
        .expect(200)
        .expect([
          {
            value: { key1: 'value1', key2: 'value2' },
            blockHeight: 1,
            blockTimeUnixMs: 1,
          },
          {
            value: null,
            blockHeight: 2,
            blockTimeUnixMs: 2,
          },
          {
            value: { key3: 'value3' },
            blockHeight: 3,
            blockTimeUnixMs: 3,
          },
        ])
    })

    it('caches computations over range and uses them in the future', async () => {
      const initialComputations = await Computation.count()

      await request(app.callback())
        .get('/contract/valid_contract/formula?blocks=1:1..3:3')
        .set('x-api-key', apiKey)
        .expect(200)

      expect(await Computation.count()).toBe(initialComputations + 3)

      // Repeating the same query should not create new computations.
      await request(app.callback())
        .get('/contract/valid_contract/formula')
        .set('x-api-key', apiKey)
        .expect(200)

      expect(await Computation.count()).toBe(initialComputations + 3)
    })
  })
})
