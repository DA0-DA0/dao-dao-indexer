import { Transformer } from '../types'
import { dbKeyForKeys } from '../utils'

const KEY_CONFIG = dbKeyForKeys('config')
const KEY_CONFIG_V2 = dbKeyForKeys('config_v2')

export const config: Transformer = {
  codeIdsKeys: ['dao-core'],
  matches: (event) => event.key === KEY_CONFIG || event.key === KEY_CONFIG_V2,
  name: 'config',
  getValue: (event) => event.valueJson,
}
