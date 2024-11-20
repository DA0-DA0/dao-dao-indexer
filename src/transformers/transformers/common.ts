import { Transformer } from '@/types'
import { dbKeyForKeys } from '@/utils'

import { makeTransformer } from '../utils'

// Transform for all contracts.
const info: Transformer = makeTransformer('any', 'info', 'contract_info')

// Transform for all contracts. cw-ownable ownership
const KEY_OWNERSHIP = dbKeyForKeys('ownership')

const ownership: Transformer = makeTransformer('any', 'ownership')
const owner: Transformer = {
  filter: {
    codeIdsKeys: 'any',
    matches: (event) => event.key === KEY_OWNERSHIP,
  },
  name: 'owner',
  getValue: (event) => event.valueJson.owner,
}

const hooks: Transformer = makeTransformer('any', 'hooks')

export default [info, ownership, owner, hooks]
