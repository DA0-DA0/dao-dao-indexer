import { getAccountWithAuth } from '@/test/utils'

import { AccountKeyCredit } from './AccountKeyCredit'

describe('addCredits', () => {
  let credit: AccountKeyCredit
  beforeEach(async () => {
    const { unpaidAccountKey } = await getAccountWithAuth()
    credit = unpaidAccountKey.credits[0]
  })

  it('sets amount', async () => {
    expect(credit.amount).toBe('0')
    await credit.addCredits(10)
    expect(credit.amount).toBe('10')
  })

  it('sets paidAt', async () => {
    expect(credit.paidAt).toBe(null)
    await credit.addCredits(10)
    expect(credit.paidAt).not.toBe(null)
  })

  it('flips paidFor', async () => {
    expect(credit.paidFor).toBe(false)
    await credit.addCredits(10)
    expect(credit.paidFor).toBe(true)
  })

  it('updates amount', async () => {
    await credit.addCredits(10)
    await credit.addCredits(20)
    expect(credit.amount).toBe('30')
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
