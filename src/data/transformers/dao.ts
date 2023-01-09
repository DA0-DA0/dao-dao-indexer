import { Transformer } from '@/core/types'
import { dbKeyToKeys } from '@/core/utils'

import { ProposalModule } from '../types'
import { makeTransformer, makeTransformerForMap } from './utils'

const CODE_IDS_KEYS = ['dao-core']

export const config = makeTransformer(CODE_IDS_KEYS, 'config', [
  'config',
  'config_v2',
])
export const paused = makeTransformer(CODE_IDS_KEYS, 'paused')
export const admin = makeTransformer(CODE_IDS_KEYS, 'admin')
export const nominatedAdmin = makeTransformer(
  CODE_IDS_KEYS,
  'nominatedAdmin',
  'nominated_admin'
)
export const votingModule = makeTransformer(
  CODE_IDS_KEYS,
  'votingModule',
  'voting_module'
)
export const activeProposalModuleCount = makeTransformer(
  CODE_IDS_KEYS,
  'activeProposalModuleCount',
  'active_proposal_module_count'
)
export const totalProposalModuleCount = makeTransformer(
  CODE_IDS_KEYS,
  'totalProposalModuleCount',
  'total_proposal_module_count'
)

export const proposalModules = makeTransformerForMap<ProposalModule>(
  CODE_IDS_KEYS,
  'proposalModule',
  ['proposal_modules', 'proposal_modules_v2'],
  {
    getValue: (event) => {
      // "proposal_modules"|"proposal_modules_v2", address
      const [namespace, address] = dbKeyToKeys(event.key, [false, false])

      // V1
      if (namespace === 'proposal_modules') {
        return {
          address,
          // V1 modules don't have a prefix.
          prefix: '',
          // V1 modules are always enabled.
          status: 'Enabled' as const,
        }
        // V2
      } else if (namespace === 'proposal_modules_v2') {
        return event.valueJson
      }

      // Should never happen.
      return null
    },
  }
)

export const subDaos = makeTransformerForMap(
  CODE_IDS_KEYS,
  'subDao',
  'sub_daos'
)
export const items = makeTransformerForMap(CODE_IDS_KEYS, 'item', 'items')
export const cw20s = makeTransformerForMap(CODE_IDS_KEYS, 'cw20', 'cw20s')
export const cw721s = makeTransformerForMap(CODE_IDS_KEYS, 'cw721', 'cw721s')
