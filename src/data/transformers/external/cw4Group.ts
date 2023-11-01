import { makeTransformerForMap } from '../utils'

const CODE_IDS_KEYS = ['cw4-group']

const member = makeTransformerForMap(CODE_IDS_KEYS, 'member', 'members')

export default [member]
