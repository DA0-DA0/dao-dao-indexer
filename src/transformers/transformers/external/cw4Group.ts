import {
  makeTransformer,
  makeTransformersForSnapshotItem,
  makeTransformersForSnapshotMap,
} from '../../utils'

const CODE_IDS_KEYS = ['cw4-group']

const hooks = makeTransformer(CODE_IDS_KEYS, 'hooks', 'cw4-hooks')
const total = makeTransformersForSnapshotItem({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'total',
  primaryKey: 'total',
  changelogKey: 'total__changelog',
})
const members = makeTransformersForSnapshotMap({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'members',
  primaryKey: 'members',
  changelogKey: 'members__changelog',
})

export default [hooks, ...total, ...members]
