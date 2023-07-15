import { makeTransformerForMap } from '../utils'

const CODE_IDS_KEYS = ['polytone-note']

const remoteAddress = makeTransformerForMap(
  CODE_IDS_KEYS,
  'remoteAddress',
  'polytone-l2r'
)

export default [remoteAddress]
