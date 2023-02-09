import request from 'supertest'

import { FormulaType, TypedFormula } from '@/core/types'
import { FormulaTypeValues } from '@/core/utils'
import { Contract } from '@/db'
import { getTypedFormula } from '@/test/mocks'
import { getAccountWithSigner } from '@/test/utils'

import { app } from './app'

const mockAllFormulasAsValidOnce = () =>
  getTypedFormula.mockImplementationOnce(
    (type: FormulaType, name: string) =>
      ({
        name,
        type,
        formula: {
          compute: async () => '',
        },
      } as TypedFormula)
  )

describe('computer: GET /(.*)', () => {
  let apiKey: string
  beforeEach(async () => {
    const { paidApiKey } = await getAccountWithSigner()
    apiKey = paidApiKey
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
    await request(app.callback())
      .get('/contract/address/invalid')
      .set('x-api-key', apiKey)
      .expect(404)
      .expect('formula not found')

    await Promise.all(
      [FormulaType.Contract, FormulaType.Wallet, FormulaType.Generic].map(
        async (type) => {
          mockAllFormulasAsValidOnce()

          const response = await request(app.callback())
            .get(`/${type}/address/formula`)
            .set('x-api-key', apiKey)
          expect(response.text).not.toBe('formula not found')
        }
      )
    )
  })

  it('validates contract exists for contract formula', async () => {
    mockAllFormulasAsValidOnce()
    await request(app.callback())
      .get('/contract/address/formula')
      .set('x-api-key', apiKey)
      .expect(404)
      .expect('contract not found')

    await Contract.create({ address: 'address', codeId: 1 })

    mockAllFormulasAsValidOnce()
    const response = await request(app.callback())
      .get('/contract/address/formula')
      .set('x-api-key', apiKey)
    expect(response.text).not.toBe('contract not found')
  })
})
