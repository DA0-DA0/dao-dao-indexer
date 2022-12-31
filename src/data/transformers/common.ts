import { Transformer } from '@/core'

import { makeTransformer } from './utils'

// Transform for all contracts.
export const info: Transformer = makeTransformer([], 'info', 'contract_info')
