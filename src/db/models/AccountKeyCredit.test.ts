import { getAccountWithSigner } from '@/test/utils'

import { AccountKeyCredit } from './AccountKeyCredit'

describe('registerCreditsPaidFor', () => {
  let credit: AccountKeyCredit
  beforeEach(async () => {
    const { unpaidAccountKey } = await getAccountWithSigner()
    credit = unpaidAccountKey.credits[0]
  })

  it('sets amount', async () => {
    expect(credit.amount).toBe(0n)
    await credit.registerCreditsPaidFor(10, false)
    expect(credit.amount).toBe(10n)
  })

  it('sets paidAt', async () => {
    expect(credit.paidAt).toBe(null)
    await credit.registerCreditsPaidFor(10, false)
    expect(credit.paidAt).not.toBe(null)
  })

  it('flips paidFor', async () => {
    expect(credit.paidFor).toBe(false)
    await credit.registerCreditsPaidFor(10, false)
    expect(credit.paidFor).toBe(true)
  })

  it('throws if already paid for when not updating', async () => {
    await credit.registerCreditsPaidFor(10, false)
    expect(() => credit.registerCreditsPaidFor(20, false)).rejects.toThrowError(
      'Credit already paid for.'
    )
  })

  it('does not update amount if already paid for when not updating', async () => {
    await credit.registerCreditsPaidFor(10, false)
    expect(() =>
      credit.registerCreditsPaidFor(20, false)
    ).rejects.toThrowError()
    expect(credit.amount).toBe(10n)
  })

  it('does not throw if already paid for when updating', async () => {
    await credit.registerCreditsPaidFor(10, true)
    expect(() => credit.registerCreditsPaidFor(20, true)).resolves
  })

  it('updates amount if already paid for when updating', async () => {
    await credit.registerCreditsPaidFor(10, true)
    await credit.registerCreditsPaidFor(20, true)
    expect(credit.amount).toBe(20n)
  })
})

describe('creditsForBlockInterval', () => {
  it('charges 1 credit for 1 block', () => {
    expect(AccountKeyCredit.creditsForBlockInterval(1n)).toBe(1)
  })

  it('charges 2 credits for 2 blocks', () => {
    expect(AccountKeyCredit.creditsForBlockInterval(2n)).toBe(2)
  })

  it('charges 2 credits for 10,000 blocks', () => {
    expect(AccountKeyCredit.creditsForBlockInterval(10000n)).toBe(2)
  })

  it('charges 3 credits for 10,001 blocks', () => {
    expect(AccountKeyCredit.creditsForBlockInterval(10001n)).toBe(3)
  })

  it('charges 3 credits for 20,000 blocks', () => {
    expect(AccountKeyCredit.creditsForBlockInterval(20000n)).toBe(3)
  })
})
