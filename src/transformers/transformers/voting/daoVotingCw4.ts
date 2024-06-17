import { makeTransformer } from '../../utils'

const CODE_IDS_KEYS = ['dao-voting-cw4']

const groupContract = makeTransformer(
  CODE_IDS_KEYS,
  'groupContract',
  'group_contract'
)

const daoAddress = makeTransformer(CODE_IDS_KEYS, 'daoAddress', 'dao_address')

export default [groupContract, daoAddress]
