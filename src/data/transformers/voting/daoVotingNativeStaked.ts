import { makeTransformer, makeTransformerForMap } from '../utils'

const CODE_IDS_KEYS = ['dao-voting-native-staked']

const config = makeTransformer(CODE_IDS_KEYS, 'config')
const dao = makeTransformer(CODE_IDS_KEYS, 'dao')
const stakedBalance = makeTransformerForMap(
  CODE_IDS_KEYS,
  'stakedBalance',
  'staked_balances'
)
const totalStaked = makeTransformer(
  CODE_IDS_KEYS,
  'totalStaked',
  'total_staked'
)

export default [config, dao, stakedBalance, totalStaked]
