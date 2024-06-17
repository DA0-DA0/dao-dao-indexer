import { ProposalModule } from '@/formulas/formulas/types'
import { dbKeyToKeys } from '@/utils'

import { makeTransformer, makeTransformerForMap } from '../../utils'

const CODE_IDS_KEYS = ['dao-core']

const config = makeTransformer(CODE_IDS_KEYS, 'config', ['config_v2', 'config'])
const paused = makeTransformer(CODE_IDS_KEYS, 'paused')
const admin = makeTransformer(CODE_IDS_KEYS, 'admin')
const nominatedAdmin = makeTransformer(
  CODE_IDS_KEYS,
  'nominatedAdmin',
  'nominated_admin'
)
const votingModule = makeTransformer(
  CODE_IDS_KEYS,
  'votingModule',
  'voting_module'
)
const activeProposalModuleCount = makeTransformer(
  CODE_IDS_KEYS,
  'activeProposalModuleCount',
  'active_proposal_module_count'
)
const totalProposalModuleCount = makeTransformer(
  CODE_IDS_KEYS,
  'totalProposalModuleCount',
  'total_proposal_module_count'
)

const proposalModules = makeTransformerForMap<ProposalModule>(
  CODE_IDS_KEYS,
  'proposalModule',
  ['governance_modules', 'proposal_modules_v2', 'proposal_modules'],
  {
    getValue: (event) => {
      // "governance_modules"|"proposal_modules"|"proposal_modules_v2", address
      const [namespace, address] = dbKeyToKeys(event.key, [false, false])

      // V1
      if (
        // beta
        namespace === 'governance_modules' ||
        // official deploy
        namespace === 'proposal_modules'
      ) {
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

const subDaos = makeTransformerForMap(CODE_IDS_KEYS, 'subDao', 'sub_daos')
const items = makeTransformerForMap(CODE_IDS_KEYS, 'item', 'items')
const cw20s = makeTransformerForMap(CODE_IDS_KEYS, 'cw20', 'cw20s')
const cw721s = makeTransformerForMap(CODE_IDS_KEYS, 'cw721', 'cw721s')

export default [
  config,
  paused,
  admin,
  nominatedAdmin,
  votingModule,
  activeProposalModuleCount,
  totalProposalModuleCount,
  proposalModules,
  subDaos,
  items,
  cw20s,
  cw721s,
]
