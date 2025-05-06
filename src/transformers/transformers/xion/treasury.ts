import { makeTransformer } from '../../utils'

const CODE_IDS_KEYS = ['xion-treasury']

const admin = makeTransformer(CODE_IDS_KEYS, 'admin')

// Export the transformers
export default [admin]
