import { Transformer } from '@/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils'

import { makeTransformer, makeTransformerForMap } from '../../utils'

// There are so many CW721 contracts, just don't filter by code ID.
const CODE_IDS_KEYS: string[] = []

const KEY_PREFIX_TOKENS__OWNER = dbKeyForKeys('tokens__owner', '')

const minter: Transformer = makeTransformer(CODE_IDS_KEYS, 'minter')

const nftInfo: Transformer = makeTransformer(
  CODE_IDS_KEYS,
  'nftInfo',
  'nft_info'
)

const tokens = makeTransformerForMap(CODE_IDS_KEYS, 'token', 'tokens')

const tokenOwners: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_TOKENS__OWNER),
  },
  name: (event) => {
    // "tokens__owner", owner, tokenId
    const [, owner, tokenId] = dbKeyToKeys(event.key, [false, false, false])
    return `tokenOwner:${owner}:${tokenId}`
  },
  getValue: () => '',
}

const numTokens = makeTransformer(CODE_IDS_KEYS, 'numTokens', 'num_tokens')

export default [minter, nftInfo, tokens, tokenOwners, numTokens]
