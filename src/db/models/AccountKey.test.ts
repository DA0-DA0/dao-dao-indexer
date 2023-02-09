import { getAccountWithSigner } from '@/test/utils'

import { AccountKey } from './AccountKey'

describe('useCredit', () => {
  let unpaidAccountKey: AccountKey
  let paidAccountKey: AccountKey
  beforeEach(async () => {
    const {
      unpaidAccountKey: _unpaidAccountKey,
      paidAccountKey: _paidAccountKey,
    } = await getAccountWithSigner()
    unpaidAccountKey = _unpaidAccountKey
    paidAccountKey = _paidAccountKey
  })

  it('returns false if no credits', async () => {
    expect(await unpaidAccountKey.useCredit()).toBe(false)
  })

  it('returns true if credit', async () => {
    expect(await paidAccountKey.useCredit()).toBe(true)
  })

  it('updates used and hits accordingly', async () => {
    const credit = paidAccountKey.credits.find((credit) => credit.paidFor)!

    expect(credit.used).toBe('0')
    expect(credit.hits).toBe('0')

    await paidAccountKey.useCredit(5)

    await credit.reload()
    expect(credit.used).toBe('5')
    expect(credit.hits).toBe('1')
  })

  it('returns false if credit is used up', async () => {
    await paidAccountKey.useCredit(
      Number(paidAccountKey.credits.find((credit) => credit.paidFor)!.amount)
    )
    expect(await paidAccountKey.useCredit()).toBe(false)
  })
})
