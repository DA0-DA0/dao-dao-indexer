import { Transformer } from '@/core'

import { makeTransformer } from './utils'

// There are so many CW20 contracts, just don't filter by them and transform all
// with key `balance`.
const CODE_IDS_KEYS: string[] = []

export const tokenInfo: Transformer = makeTransformer(
  CODE_IDS_KEYS,
  'tokenInfo',
  'token_info'
)
