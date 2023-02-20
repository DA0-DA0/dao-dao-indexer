import { Transformer } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

import { makeTransformer } from '../utils'

const CODE_IDS_KEYS = ['dao-voting-cw721-staked']

const KEY_PREFIX_SNPW = dbKeyForKeys('snpw', '')
const KEY_PREFIX_NB = dbKeyForKeys('nb', '')

const config = makeTransformer(CODE_IDS_KEYS, 'config')
const dao = makeTransformer(CODE_IDS_KEYS, 'dao')
const totalStakedNfts = makeTransformer(CODE_IDS_KEYS, 'tsn')

const stakedNftPerOwner: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_SNPW),
  },
  name: (event) => {
    // "snpw", address, tokenId
    const [, address, tokenId] = dbKeyToKeys(event.key, [false, false, false])
    return `stakedNft:${address}:${tokenId}`
  },
  getValue: () => '',
}

const stakedNftOwner: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_SNPW),
  },
  name: (event) => {
    // "snpw", address, tokenId
    const [, , tokenId] = dbKeyToKeys(event.key, [false, false, false])
    return `stakedNftOwner:${tokenId}`
  },
  getValue: (event) => {
    // "snpw", address, tokenId
    const [, address] = dbKeyToKeys(event.key, [false, false, false])
    return address
  },
}

// Maintain running count of staked NFTs per owner.
const stakedCount: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_NB),
  },
  name: (event) => {
    // "nb", address
    const [, address] = dbKeyToKeys(event.key, [false, false])
    return `stakedCount:${address}`
  },
  getValue: (event) => event.valueJson,
}

export default [
  config,
  dao,
  totalStakedNfts,
  stakedNftPerOwner,
  stakedNftOwner,
  stakedCount,
]
