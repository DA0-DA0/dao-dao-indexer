import { Transformer } from '@/core/types'
import { dbKeyForKeys } from '@/core/utils'

const CODE_IDS_KEYS: string[] = ['dao-pre-propose-approval-single']

const KEY_APPROVER = dbKeyForKeys('approver')

const approver: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key === KEY_APPROVER,
  },
  name: (event) => `approver:${event.valueJson}`,
  getValue: async () => true,
}

export default [approver]
