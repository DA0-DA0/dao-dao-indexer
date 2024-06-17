import { Transformer } from '@/types'
import { dbKeyForKeys } from '@/utils'

const CODE_IDS_KEYS: string[] = ['valence-account']

const KEY_ADMIN = dbKeyForKeys('admin')

const admin: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key === KEY_ADMIN,
  },
  name: (event) => `admin:${event.valueJson}`,
  getValue: async () => true,
}

export default [admin]
