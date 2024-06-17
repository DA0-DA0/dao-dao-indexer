import { Transformer } from '@/types'
import { dbKeyForKeys } from '@/utils'

const CODE_IDS_KEYS: string[] = ['cw1-whitelist']

const KEY_ADMIN_LIST = dbKeyForKeys('admin_list')

const admins: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key === KEY_ADMIN_LIST,
  },
  name: 'admins',
  getValue: (event) => event.valueJson.admins,
}

export default [admins]
