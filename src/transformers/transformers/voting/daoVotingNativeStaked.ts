import {
  makeTransformer,
  makeTransformerForMap,
  makeTransformersForSnapshotItem,
  makeTransformersForSnapshotMap,
} from '../../utils'

const CODE_IDS_KEYS = ['dao-voting-native-staked']

const config = makeTransformer(CODE_IDS_KEYS, 'config')
const dao = makeTransformer(CODE_IDS_KEYS, 'dao')
const stakedBalances = makeTransformersForSnapshotMap({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'stakedBalances',
  primaryKey: 'staked_balances',
  changelogKey: 'staked_balance__changelog',
})
const stakedTotal = makeTransformersForSnapshotItem({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'stakedTotal',
  primaryKey: 'total_staked',
  changelogKey: 'total_staked__changelog',
})
const activeThreshold = makeTransformer(
  CODE_IDS_KEYS,
  'activeThreshold',
  'active_threshold'
)
const claims = makeTransformerForMap(CODE_IDS_KEYS, 'claims', 'claims')

export default [
  config,
  dao,
  ...stakedBalances,
  ...stakedTotal,
  activeThreshold,
  claims,
]
