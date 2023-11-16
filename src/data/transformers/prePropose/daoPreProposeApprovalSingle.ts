import { Transformer } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

import { makeTransformerForMap } from '../utils'

const CODE_IDS_KEYS: string[] = ['dao-pre-propose-approval-single']

const KEY_APPROVER = dbKeyForKeys('approver')
const KEY_PREFIX_PENDING_PROPOSALS = dbKeyForKeys('pending_proposals', '')
const KEY_PREFIX_COMPLETED_PROPOSALS = dbKeyForKeys('completed_proposals', '')

const approver: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key === KEY_APPROVER,
  },
  name: (event) => `approver:${event.valueJson}`,
  getValue: async () => true,
}

const pendingProposal: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_PENDING_PROPOSALS),
  },
  name: (event) => {
    // "pending_proposals", proposalId
    const [, proposalId] = dbKeyToKeys(event.key, [false, true])
    return `pendingProposal:${proposalId}`
  },
  getValue: (event) => event.valueJson,
}

const completedProposal: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_COMPLETED_PROPOSALS),
  },
  name: (event) => {
    // "completed_proposals", proposalId
    const [, proposalId] = dbKeyToKeys(event.key, [false, true])
    return `completedProposal:${proposalId}`
  },
  getValue: (event) => event.valueJson,
}

const proposed: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) =>
      event.key.startsWith(KEY_PREFIX_PENDING_PROPOSALS) &&
      !!event.valueJson?.proposer &&
      event.valueJson?.status &&
      'pending' in event.valueJson.status,
  },
  name: (event) => {
    // Ignore deletes. Can't transform if we can't access the proposer.
    if (event.delete || !event.valueJson?.proposer) {
      return
    }

    // "pending_proposals", proposalId
    const [, proposalId] = dbKeyToKeys(event.key, [false, true])
    return `proposed:${event.valueJson.proposer}:${proposalId}`
  },
  getValue: (event) => {
    // "pending_proposals", proposalId
    const [, proposalId] = dbKeyToKeys(event.key, [false, true])
    return { proposalId }
  },
}

const createdToCompletedProposal = makeTransformerForMap(
  CODE_IDS_KEYS,
  'createdToCompletedProposal',
  'created_to_completed_proposal',
  {
    numericKey: true,
  }
)

export default [
  approver,
  pendingProposal,
  completedProposal,
  proposed,
  createdToCompletedProposal,
]
