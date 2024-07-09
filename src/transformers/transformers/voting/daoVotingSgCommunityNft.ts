import { makeTransformer, makeTransformerForMap } from '../../utils'

const CODE_IDS_KEYS = ['dao-voting-sg-community-nft']

const dao = makeTransformer(CODE_IDS_KEYS, 'dao')
const nft = makeTransformer(CODE_IDS_KEYS, 'nft')
const totalPower = makeTransformer(CODE_IDS_KEYS, 'tvp')

const voterTokens = makeTransformerForMap(CODE_IDS_KEYS, 'vt', 'vts')
const votingPower = makeTransformerForMap(CODE_IDS_KEYS, 'vp', 'vp')

export default [dao, nft, totalPower, voterTokens, votingPower]
