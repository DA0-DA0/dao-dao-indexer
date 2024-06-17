import { makeTransformer } from '../../utils'

const CODE_IDS_KEYS = ['dao-voting-cw20-staked']

const stakingContract = makeTransformer(
  CODE_IDS_KEYS,
  'stakingContract',
  'staking_contract'
)
const dao = makeTransformer(CODE_IDS_KEYS, 'dao')
const token = makeTransformer(CODE_IDS_KEYS, 'token')
const activeThreshold = makeTransformer(
  CODE_IDS_KEYS,
  'activeThreshold',
  'active_threshold'
)

export default [stakingContract, dao, token, activeThreshold]
