import { Transformer } from '@/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils'

import { makeTransformer } from '../../utils'

const CODE_IDS_KEYS = ['dao-voting-onft-staked']

const KEY_PREFIX_SNPW = dbKeyForKeys('snpw', '')
const KEY_PREFIX_NB = dbKeyForKeys('nb', '')
const KEY_PREFIX_NC = dbKeyForKeys('nc', '')

const config = makeTransformer(CODE_IDS_KEYS, 'config')
const dao = makeTransformer(CODE_IDS_KEYS, 'dao')
const totalStakedNfts = makeTransformer(CODE_IDS_KEYS, 'tsn')
const activeThreshold = makeTransformer(
  CODE_IDS_KEYS,
  'activeThreshold',
  'active_threshold'
)

const claim: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_NC),
  },
  name: (event) => {
    // "nc", address, tokenId
    const [, address, tokenId] = dbKeyToKeys(event.key, [false, false, false])
    return `claim:${address}:${tokenId}`
  },
  getValue: (event) => event.valueJson,
}

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
  activeThreshold,
  claim,
]
