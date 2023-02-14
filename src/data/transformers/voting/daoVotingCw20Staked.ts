import { makeTransformer } from '../utils'

const CODE_IDS_KEYS = ['dao-voting-cw20-staked']

const stakingContract = makeTransformer(
  CODE_IDS_KEYS,
  'stakingContract',
  'staking_contract'
)
const dao = makeTransformer(CODE_IDS_KEYS, 'dao')
const token = makeTransformer(CODE_IDS_KEYS, 'token')

export default [stakingContract, dao, token]
