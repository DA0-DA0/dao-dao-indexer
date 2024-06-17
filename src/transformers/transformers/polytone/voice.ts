import { dbKeyForKeys, dbKeyToKeys } from '@/utils'

import { Transformer } from '../../types'

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

// Store the sender info for a given proxy in a backwards-compatible way. The
// new version of the proxy stores this object directly in the p2c key, but both
// the old and new versions have c2p keys which store the same information in a
// different format. This redundancy is because the contract needs to
// efficiently access the information in different ways, but it makes no
// difference to the indexer.
const senderInfo: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_C2P),
  },
  name: (event) => `senderInfo:${event.valueJson}`,
  getValue: (event) => {
    const [, connection_id, remote_port, remote_sender] = dbKeyToKeys(
      event.key,
      [false, false, false, false]
    )

    return {
      connection_id,
      remote_port,
      remote_sender,
    }
  },
}

export default [remoteController, senderInfo]
