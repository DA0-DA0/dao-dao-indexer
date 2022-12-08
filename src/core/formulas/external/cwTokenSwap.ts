import { Formula } from '../../types'

export const status: Formula = async ({ contractAddress, get }) => {
  const counterparty_one = await get(contractAddress, 'counterparty_one')
  const counterparty_two = await get(contractAddress, 'counterparty_two')

  return counterparty_one && counterparty_two
    ? {
        counterparty_one,
        counterparty_two,
      }
    : undefined
}
