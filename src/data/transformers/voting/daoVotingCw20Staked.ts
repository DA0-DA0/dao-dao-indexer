import { makeTransformer } from '../utils'

const CODE_IDS_KEYS = ['dao-voting-cw20-staked']

const stakingContract = makeTransformer(
  CODE_IDS_KEYS,
  'stakingContract',
  'staking_contract'
)
const dao = makeTransformer(CODE_IDS_KEYS, 'dao')

export default [stakingContract, dao]
