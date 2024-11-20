import { makeTransformerForMap } from '@/transformers/utils'
import { Transformer } from '@/types'

const CODE_IDS_KEYS: string[] = ['dao-rewards-distributor']

const distributions: Transformer = makeTransformerForMap(
  CODE_IDS_KEYS,
  'distribution',
  'd',
  { namer: { input: 'number' } }
)

export default [distributions]
