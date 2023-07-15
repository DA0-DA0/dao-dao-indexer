import { makeTransformerForMap } from '../utils'

const CODE_IDS_KEYS = ['polytone-note']

const remoteAddress = makeTransformerForMap(
  CODE_IDS_KEYS,
  'remoteAddress',
  'polytone-account-map'
)

export default [remoteAddress]
