import { Transformer } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

import { makeTransformer } from '../utils'

// There are so many CW20 contracts, just don't filter by code ID.
const CODE_IDS_KEYS: string[] = []

const KEY_PREFIX_BALANCE = dbKeyForKeys('balance', '')

const hasBalance: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_BALANCE),
  },
  name: (event) => {
    // "balance", address
    const [, address] = dbKeyToKeys(event.key, [false, false])
    return `hasBalance:${address}`
  },
  getValue: async ({ value }, getLastValue) => {
    const prevHasBalance = await getLastValue()
    const hasBalance = value !== '0'

    // Only save transformation if the value has changed.
    return prevHasBalance === hasBalance ? undefined : hasBalance
  },
}

const tokenInfo: Transformer = makeTransformer(
  CODE_IDS_KEYS,
  'tokenInfo',
  'token_info'
)

export default [hasBalance, tokenInfo]
