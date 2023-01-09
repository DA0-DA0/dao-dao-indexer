import { Transformer } from '@/core'

import { makeTransformer } from './utils'

// Transform for all contracts.
const info: Transformer = makeTransformer([], 'info', 'contract_info')

export default [info]
