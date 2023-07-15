import { Transformer } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

const CODE_IDS_KEYS = ['polytone-voice']
const KEY_PREFIX_C2P = dbKeyForKeys('c2p', '')

// Store the remote controller for a given proxy.
const remoteController: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_C2P),
  },
  name: (event) => `remoteController:${event.valueJson}`,
  getValue: (event) => {
    const [, , , remoteController] = dbKeyToKeys(event.key, [
      false,
      false,
      false,
      false,
    ])
    return remoteController
  },
}

export default [remoteController]
