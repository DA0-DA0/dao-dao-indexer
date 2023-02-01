import { Transformer } from '@/core'

import { makeTransformer } from '../utils'

// There are so many CW20 contracts, just don't filter by code ID.
const CODE_IDS_KEYS: string[] = []

const tokenInfo: Transformer = makeTransformer(
  CODE_IDS_KEYS,
  'tokenInfo',
  'token_info'
)

export default [tokenInfo]
