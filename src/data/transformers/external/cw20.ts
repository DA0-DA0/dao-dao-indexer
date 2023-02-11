import { Transformer } from '@/core'

import { makeTransformer, makeTransformerForMap } from '../utils'

// There are so many CW20 contracts, just don't filter by code ID.
const CODE_IDS_KEYS: string[] = []

const balance: Transformer = makeTransformerForMap(
  CODE_IDS_KEYS,
  'balance',
  'balance'
)
const tokenInfo: Transformer = makeTransformer(
  CODE_IDS_KEYS,
  'tokenInfo',
  'token_info'
)

export default [balance, tokenInfo]
