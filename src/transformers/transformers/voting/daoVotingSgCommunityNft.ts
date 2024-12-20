import {
  makeTransformer,
  makeTransformerForMap,
  makeTransformersForSnapshotItem,
  makeTransformersForSnapshotMap,
} from '../../utils'

const CODE_IDS_KEYS = ['dao-voting-sg-community-nft']

const dao = makeTransformer(CODE_IDS_KEYS, 'dao')
const nft = makeTransformer(CODE_IDS_KEYS, 'nft')
const voterTokens = makeTransformerForMap(CODE_IDS_KEYS, 'vt', 'vts')

const votingPower = makeTransformersForSnapshotMap({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'vp',
  primaryKey: 'vp',
  changelogKey: 'vp__changelog',
})
const totalPower = makeTransformersForSnapshotItem({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'tvp',
  primaryKey: 'tvp',
  changelogKey: 'tvp__changelog',
})

export default [dao, nft, voterTokens, ...votingPower, ...totalPower]
