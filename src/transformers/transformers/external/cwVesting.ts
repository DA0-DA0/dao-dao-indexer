import { Transformer } from '@/types'

import { makeTransformer } from '../../utils'

const CODE_IDS_KEYS: string[] = ['cw-vesting']

const vesting: Transformer = makeTransformer(CODE_IDS_KEYS, 'vesting')
const ubs: Transformer = makeTransformer(CODE_IDS_KEYS, 'ubs')

export default [vesting, ubs]
