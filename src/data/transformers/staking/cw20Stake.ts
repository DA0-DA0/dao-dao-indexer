import { makeTransformerForMap } from '../utils'

const CODE_IDS_KEYS = ['cw20-stake']

export const stakedBalance = makeTransformerForMap(
  CODE_IDS_KEYS,
  'stakedBalance',
  'staked_balances'
)

export default [stakedBalance]
