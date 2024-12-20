import {
  makeTransformersForSnapshotItem,
  makeTransformersForSnapshotMap,
} from '../../utils'

const CODE_IDS_KEYS = ['cw20-stake']

const stakedBalance = makeTransformersForSnapshotMap({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'stakedBalance',
  primaryKey: 'staked_balances',
  changelogKey: 'staked_balance__changelog',
})
const stakedTotal = makeTransformersForSnapshotItem({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'stakedTotal',
  primaryKey: 'total_staked',
  changelogKey: 'total_staked__changelog',
})

export default [...stakedBalance, ...stakedTotal]
