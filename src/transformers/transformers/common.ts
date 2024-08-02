import { Transformer } from '@/types'
import { dbKeyForKeys } from '@/utils'

import { makeTransformer } from '../utils'

// Transform for all contracts.
const info: Transformer = makeTransformer([], 'info', 'contract_info')

// Transform for all contracts. cw-ownable ownership
const KEY_OWNERSHIP = dbKeyForKeys('ownership')

const ownership: Transformer = makeTransformer([], 'ownership')
const owner: Transformer = {
  filter: {
    codeIdsKeys: [],
    matches: (event) => event.key === KEY_OWNERSHIP,
  },
  name: 'owner',
  getValue: (event) => event.valueJson.owner,
}

export default [info, ownership, owner]
