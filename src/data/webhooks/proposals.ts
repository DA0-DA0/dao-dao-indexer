import { Webhook } from '@/core'
import { dbKeyForKeys } from '@/core/utils'

import { Status } from '../formulas/contract/proposal/types'

const CODE_IDS_KEYS = ['dao-proposal-single']

const KEY_PREFIX_PROPOSALS = dbKeyForKeys('proposals', '')
const KEY_PREFIX_PROPOSALS_V2 = dbKeyForKeys('proposals_v2', '')

// Fire webhook when a proposal is created.
export const propose: Webhook = {
  codeIdsKeys: CODE_IDS_KEYS,
  matches: (event) =>
    // Starts with proposals or proposals_v2.
    (event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
      event.key.startsWith(KEY_PREFIX_PROPOSALS_V2)) &&
    event.valueJson?.status === Status.Open,
  endpoint: {
    url: 'https://webhook.site/ae8c9d3f-de9e-4a88-b948-6fb005ec0831',
    method: 'POST',
  },
  getValue: async (event, getLastEvent) => {
    // Only fire the webhook the first time this exists.
    if ((await getLastEvent()) !== null) {
      return
    }

    return event.valueJson
  },
}
