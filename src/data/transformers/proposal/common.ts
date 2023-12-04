import { Transformer } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

import { StatusEnum } from '../../formulas/contract/proposal/types'
import { VoteCast } from '../../types'

const CODE_IDS_KEYS = ['dao-proposal-single', 'dao-proposal-multiple']

const KEY_PREFIX_PROPOSALS = dbKeyForKeys('proposals', '')
const KEY_PREFIX_PROPOSALS_V2 = dbKeyForKeys('proposals_v2', '')
const KEY_PREFIX_BALLOTS = dbKeyForKeys('ballots', '')
const KEY_CONFIG_V2 = dbKeyForKeys('config_v2')

const proposal: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) =>
      // Starts with proposals or proposals_v2.
      event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
      event.key.startsWith(KEY_PREFIX_PROPOSALS_V2),
  },
  name: (event) => {
    // "proposals"|"proposals_v2", proposalId
    const [, proposalId] = dbKeyToKeys(event.key, [false, true])
    return `proposal:${proposalId}`
  },
  getValue: (event) => event.valueJson,
}

const proposed: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) =>
      // Starts with proposals or proposals_v2.
      (event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
        event.key.startsWith(KEY_PREFIX_PROPOSALS_V2)) &&
      !!event.valueJson?.proposer &&
      event.valueJson?.status === StatusEnum.Open,
  },
  name: (event) => {
    // Ignore deletes. Can't transform if we can't access the proposer.
    if (event.delete || !event.valueJson?.proposer) {
      return
    }

    // "proposals"|"proposals_v2", proposalId
    const [, proposalId] = dbKeyToKeys(event.key, [false, true])
    return `proposed:${event.valueJson.proposer}:${proposalId}`
  },
  getValue: (event) => {
    // "proposals"|"proposals_v2", proposalId
    const [, proposalId] = dbKeyToKeys(event.key, [false, true])
    return { proposalId }
  },
}

const voteCast: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_BALLOTS),
  },
  name: (event) => {
    // "ballots", proposalId, address
    const [, proposalId, address] = dbKeyToKeys(event.key, [false, true, false])
    return `voteCast:${address}:${proposalId}`
  },
  getValue: (event) => {
    // "ballots", proposalId, address
    const [, proposalId, voter] = dbKeyToKeys(event.key, [false, true, false])

    return {
      proposalId,
      voter,
      vote: event.valueJson,
      votedAt: event.blockTimestamp.toISOString(),
    } as VoteCast
  },
}

const vetoer: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key === KEY_CONFIG_V2 && !!event.valueJson.veto,
  },
  name: (event) => `vetoer:${event.valueJson.veto.vetoer}`,
  getValue: () => '',
}

// Map `proposalVetoer:<VETOER>` to proposal ID.
const proposalVetoer: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) =>
      // Starts with proposals or proposals_v2.
      (event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
        event.key.startsWith(KEY_PREFIX_PROPOSALS_V2)) &&
      !!event.valueJson.veto,
  },
  name: (event) => `proposalVetoer:${event.valueJson.veto.vetoer}`,
  getValue: (event) => {
    // "proposals"|"proposals_v2", proposalId
    const [, proposalId] = dbKeyToKeys(event.key, [false, true])
    return proposalId
  },
}

export default [proposal, proposed, voteCast, vetoer, proposalVetoer]
