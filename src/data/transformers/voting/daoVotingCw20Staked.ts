import { makeTransformer, makeTransformerForMap } from '../utils'

const CODE_IDS_KEYS = ['dao-voting-cw20-staked']

const userWeights = makeTransformerForMap(
  CODE_IDS_KEYS,
  'userWeight',
  'user_weights'
)

const totalWeight = makeTransformer(
  CODE_IDS_KEYS,
  'totalWeight',
  'total_weight'
)

const groupContract = makeTransformer(
  CODE_IDS_KEYS,
  'groupContract',
  'group_contract'
)

const daoAddress = makeTransformer(CODE_IDS_KEYS, 'daoAddress', 'dao_address')

export default [userWeights, totalWeight, groupContract, daoAddress]
