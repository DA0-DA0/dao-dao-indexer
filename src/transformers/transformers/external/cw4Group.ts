import { makeTransformer, makeTransformerForMap } from '../../utils'

const CODE_IDS_KEYS = ['cw4-group']

const member = makeTransformerForMap(CODE_IDS_KEYS, 'member', 'members')
const hooks = makeTransformer(CODE_IDS_KEYS, 'hooks', 'cw4-hooks')

export default [member, hooks]
