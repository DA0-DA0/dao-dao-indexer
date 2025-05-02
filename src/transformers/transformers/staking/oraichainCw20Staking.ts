import { toBech32 } from '@cosmjs/encoding'

import { ConfigManager } from '@/config'

import { makeTransformersForSnapshotMap } from '../../utils'

const CODE_IDS_KEYS = ['oraichain-cw20-staking']

const stakedBalance = makeTransformersForSnapshotMap({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'stakedBalance',
  primaryKey: 'staked_balances',
  changelogKey: 'staked_balance__changelog',
  namer: {
    input: ['bytes', 'string'],
    transform: ([assetKeyRaw, address]) => {
      const { bech32Prefix } = ConfigManager.load()
      const tokenAddress = toBech32(bech32Prefix, assetKeyRaw as Uint8Array)
      return `${tokenAddress}:${address}`
    },
  },
})

const stakedTotal = makeTransformersForSnapshotMap({
  codeIdsKeys: CODE_IDS_KEYS,
  name: 'stakedTotal',
  primaryKey: 'total_staked',
  changelogKey: 'total_staked__changelog',
  namer: {
    input: 'bytes',
    transform: ([assetKeyRaw]) => {
      const { bech32Prefix } = ConfigManager.load()
      const tokenAddress = toBech32(bech32Prefix, assetKeyRaw as Uint8Array)
      return tokenAddress
    },
  },
})

export default [...stakedBalance, ...stakedTotal]
