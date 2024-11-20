import { Transformer } from '@/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils'

import {
  makeTransformer,
  makeTransformersForSnapshotItem,
  makeTransformersForSnapshotMap,
} from '../../utils'

const CODE_IDS_KEYS = ['dao-voting-onft-staked']

const KEY_PREFIX_SNPW = dbKeyForKeys('snpw', '')
const KEY_PREFIX_NC = dbKeyForKeys('nc', '')

const config = makeTransformer(CODE_IDS_KEYS, 'config')
const dao = makeTransformer(CODE_IDS_KEYS, 'dao')
const nftBalances = makeTransformersForSnapshotMap({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'nftBalances',
  primaryKey: 'nb',
  changelogKey: 'nb__changelog',
})
const totalStakedNfts = makeTransformersForSnapshotItem({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'totalStakedNfts',
  primaryKey: 'tsn',
  changelogKey: 'tsn__changelog',
})
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

export default [
  config,
  dao,
  ...nftBalances,
  ...totalStakedNfts,
  stakedNftPerOwner,
  stakedNftOwner,
  activeThreshold,
  claim,
]
