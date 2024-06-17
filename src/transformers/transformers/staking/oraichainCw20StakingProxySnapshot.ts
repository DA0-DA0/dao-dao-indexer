import { Transformer } from '@/core/types'
import { dbKeyForKeys } from '@/core/utils'

const CODE_IDS_KEYS = ['oraichain-cw20-staking-proxy-snapshot']

const configKey = dbKeyForKeys('config')

const proxyFor: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) =>
      event.key === configKey &&
      !event.delete &&
      event.valueJson.staking_contract &&
      event.valueJson.asset_key,
  },
  name: 'proxyFor',
  getValue: (event) =>
    `${event.valueJson.staking_contract}:${event.valueJson.asset_key}`,
}

export default [proxyFor]
