import { ProposalModule } from '../formulas/types'
import { Transformer } from '../types'
import { dbKeyForKeys, dbKeyToKeys } from '../utils'
import { makeTransformer } from './utils'

const CODE_IDS_KEYS = ['dao-core']

const KEY_PREFIX_PROPOSAL_MODULES = dbKeyForKeys('proposal_modules', '')
const KEY_PREFIX_PROPOSAL_MODULES_V2 = dbKeyForKeys('proposal_modules_v2', '')

export const config: Transformer = makeTransformer(CODE_IDS_KEYS, 'config', [
  'config',
  'config_v2',
])
export const paused: Transformer = makeTransformer(CODE_IDS_KEYS, 'paused')
export const admin: Transformer = makeTransformer(CODE_IDS_KEYS, 'admin')
export const nominatedAdmin: Transformer = makeTransformer(
  CODE_IDS_KEYS,
  'nominatedAdmin',
  'nominated_admin'
)
export const votingModule: Transformer = makeTransformer(
  CODE_IDS_KEYS,
  'votingModule',
  'voting_module'
)
export const activeProposalModuleCount: Transformer = makeTransformer(
  CODE_IDS_KEYS,
  'activeProposalModuleCount',
  'active_proposal_module_count'
)
export const totalProposalModuleCount: Transformer = makeTransformer(
  CODE_IDS_KEYS,
  'totalProposalModuleCount',
  'total_proposal_module_count'
)

export const proposalModules: Transformer<ProposalModule> = {
  codeIdsKeys: CODE_IDS_KEYS,
  matches: (event) =>
    event.key.startsWith(KEY_PREFIX_PROPOSAL_MODULES) ||
    event.key.startsWith(KEY_PREFIX_PROPOSAL_MODULES_V2),
  name: (event) => {
    // "proposal_modules"|"proposal_modules_v2", proposalModuleAddress
    const [, address] = dbKeyToKeys(event.key, [false, false])
    return `proposalModules:${address}`
  },
  getValue: (event) => {
    // "proposal_modules"|"proposal_modules_v2", proposalModuleAddress
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

    return null
  },
}
