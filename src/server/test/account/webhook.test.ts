import request from 'supertest'

import { loadConfig } from '@/core'
import { AccountKey, AccountKeyCreditPaymentSource } from '@/db'
import { getAccountWithSigner } from '@/test/utils'

import { app } from './app'

describe('POST /webhook/:paymentSource', () => {
  const { payment } = loadConfig()

  let unpaidAccountKey: AccountKey
  beforeEach(async () => {
    const { unpaidAccountKey: _unpaidAccountKey } = await getAccountWithSigner()
    unpaidAccountKey = _unpaidAccountKey
  })

  it('returns error if invalid payment source', async () => {
    await request(app.callback())
      .post('/webhook/invalid')
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid paymentSource.',
      })
  })

  describe(AccountKeyCreditPaymentSource.CwReceipt, () => {
    const url = `/webhook/${AccountKeyCreditPaymentSource.CwReceipt}`
    const serializedDenom = 'n' + payment!.nativeDenomAccepted

    it('returns error if invalid API key', async () => {
      await request(app.callback())
        .post(url)
        .set('X-API-Key', 'invalid')
        .expect(401)
        .expect('Content-Type', /json/)
        .expect({
          error: 'Invalid secret.',
        })
    })

    it('returns error if missing any required field', async () => {
      const requiredFields = ['receiptId', 'amount', 'serializedDenom']

      await Promise.all(
        requiredFields.map(
          async (excludeField) =>
            await request(app.callback())
              .post(url)
              .set('X-API-Key', payment!.cwReceiptWebhookSecret)
              .send(
                requiredFields.reduce(
                  (body, field) =>
                    field === excludeField
                      ? body
                      : {
                          ...body,
                          [field]: 'test',
                        },
                  {}
                )
              )
              .expect(400)
              .expect('Content-Type', /json/)
              .expect({
                error: 'Invalid body.',
              })
        )
      )
    })

    it('returns error with ok status if incorrect denom', async () => {
      await request(app.callback())
        .post(url)
        .set('X-API-Key', payment!.cwReceiptWebhookSecret)
        .send({
          receiptId: 'test',
          amount: '100',
          serializedDenom: 'test',
        })
        .expect(202)
        .expect('Content-Type', /json/)
        .expect({
          error: `Invalid denom. Expected: ${payment!.nativeDenomAccepted}`,
        })
    })

    it('returns error if empty receiptId', async () => {
      await request(app.callback())
        .post(url)
        .set('X-API-Key', payment!.cwReceiptWebhookSecret)
        .send({
          receiptId: '',
          amount: '100',
          serializedDenom,
        })
        .expect(400)
        .expect('Content-Type', /json/)
        .expect({
          error: 'Invalid payment ID.',
        })
    })

    it('returns error if invalid amount', async () => {
      await Promise.all(
        ['', 'abc', '0', '-1', '1.5'].map(
          async (amount) =>
            await request(app.callback())
              .post(url)
              .set('X-API-Key', payment!.cwReceiptWebhookSecret)
              .send({
                receiptId: 'test',
                amount,
                serializedDenom,
              })
              .expect(202)
              .expect('Content-Type', /json/)
              .expect({
                error: 'Invalid amount paid.',
              })
        )
      )
    })

    it('returns error with ok status if credit not found with payment ID', async () => {
      await request(app.callback())
        .post(url)
        .set('X-API-Key', payment!.cwReceiptWebhookSecret)
        .send({
          receiptId: 'invalid',
          amount: '100',
          serializedDenom,
        })
        .expect(202)
        .expect('Content-Type', /json/)
        .expect({
          error: 'Invalid payment ID.',
        })
    })

    it('gives credits scaled by configured scale factor on success', async () => {
      const credit = unpaidAccountKey.credits[0]
      expect(credit.paidFor).toBe(false)
      expect(credit.amount).toBe(0n)

      await request(app.callback())
        .post(url)
        .set('X-API-Key', payment!.cwReceiptWebhookSecret)
        .send({
          receiptId: credit.paymentId,
          amount: '100',
          serializedDenom,
        })
        .expect(200)
        .expect('Content-Type', /json/)
        .expect({
          success: true,
        })

      await credit.reload()
      expect(credit.paidFor).toBe(true)
      expect(credit.amount).toBe(
        BigInt(Math.round(100 * payment!.creditScaleFactor))
      )
    })

    it('updates credits if already paid for', async () => {
      const credit = unpaidAccountKey.credits[0]
      await credit.registerCreditsPaidFor(100, false)
      expect(credit.paidFor).toBe(true)
      expect(credit.amount).toBe(100n)

      await request(app.callback())
        .post(url)
        .set('X-API-Key', payment!.cwReceiptWebhookSecret)
        .send({
          receiptId: credit.paymentId,
          amount: '200',
          serializedDenom,
        })
        .expect(200)
        .expect('Content-Type', /json/)
        .expect({
          success: true,
        })

      await credit.reload()
      expect(credit.paidFor).toBe(true)
      expect(credit.amount).toBe(
        BigInt(Math.round(200 * payment!.creditScaleFactor))
      )
    })
  })
})
