import { Formula } from '../../types'
import { Denom } from '../types'

interface Token {
  reserve: string
  denom: Denom
}

export const price: Formula = async ({ contractAddress, get }) => {
  const token1 = await get<Token>(contractAddress, 'token1')
  const token2 = await get<Token>(contractAddress, 'token2')
  if (!token1 || !token2) {
    return undefined
  }

  const token1Amount = BigInt(token1.reserve)
  const token2Amount = BigInt(token2.reserve)

  if (token1Amount === 0n || token2Amount === 0n) {
    return undefined
  }

  return {
    token1: {
      denom: token1.denom,
      price: (token2Amount / token1Amount).toString(),
    },
    token2: {
      denom: token2.denom,
      price: (token1Amount / token2Amount).toString(),
    },
  }
}
