import { Formula } from '../../types'
import { Denom } from '../types'
import { tokenInfo } from './cw20'

interface Token {
  reserve: string
  denom: Denom
}

export const summary: Formula = async (env) => {
  const { contractAddress, get, prefetch } = env

  await prefetch(contractAddress, 'token1', 'token2')

  const token1 = await get<Token>(contractAddress, 'token1')
  const token2 = await get<Token>(contractAddress, 'token2')
  if (!token1 || !token2) {
    return undefined
  }

  const token1Amount = parseFloat(token1.reserve)
  const token2Amount = parseFloat(token2.reserve)

  if (token1Amount === 0 || token2Amount === 0) {
    return undefined
  }

  // Get CW20 token info if available.
  const token1Cw20 =
    'cw20' in token1.denom
      ? await tokenInfo({ ...env, contractAddress: token1.denom.cw20 })
      : undefined
  const token2Cw20 =
    'cw20' in token2.denom
      ? await tokenInfo({ ...env, contractAddress: token2.denom.cw20 })
      : undefined

  return {
    token1: {
      denom: token1.denom,
      cw20Info: token1Cw20,
      reserve: token1Amount,
      price: token2Amount / token1Amount,
    },
    token2: {
      denom: token2.denom,
      cw20Info: token2Cw20,
      reserve: token2Amount,
      price: token1Amount / token2Amount,
    },
  }
}
