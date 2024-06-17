import { toBech32 } from '@cosmjs/encoding'

import { loadConfig } from '@/config'
import { Transformer } from '@/types'
import { dbKeyForKeys, dbKeyToKeysAdvanced } from '@/utils'

import { defaultGetValue } from '../../utils'

const CODE_IDS_KEYS = ['oraichain-cw20-staking']

const stakedBalancesKeyPrefix = dbKeyForKeys('staked_balances', '')

const stakedBalance: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(stakedBalancesKeyPrefix),
  },
  name: (event) => {
    const { bech32Prefix } = loadConfig()
    const [, assetKeyRaw, address] = dbKeyToKeysAdvanced(event.key, [
      'string',
      'bytes',
      'string',
    ])
    const tokenAddress = toBech32(bech32Prefix, assetKeyRaw as Uint8Array)
    return `stakedBalance:${tokenAddress}:${address}`
  },
  getValue: defaultGetValue,
}

export default [stakedBalance]
