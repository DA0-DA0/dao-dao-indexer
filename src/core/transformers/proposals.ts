import { Transformer } from '../types'
import { dbKeyForKeys, dbKeyToKeys } from '../utils'

const KEY_PREFIX_PROPOSALS = dbKeyForKeys('proposals', '')
const KEY_PREFIX_PROPOSALS_V2 = dbKeyForKeys('proposals_v2', '')
const KEY_PREFIX_BALLOTS = dbKeyForKeys('ballots', '')

export const proposed: Transformer = {
  codeIdsKeys: ['dao-proposal-single'],
  matches: (event) =>
    // Starts with proposals or proposals_v2.
    (event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
      event.key.startsWith(KEY_PREFIX_PROPOSALS_V2)) &&
    !!event.valueJson.proposer,
  name: (event) => {
    // "proposals"|"proposals_v2", proposalId
    const keys = dbKeyToKeys(event.key, [false, true])
    return `proposed:${event.valueJson.proposer}:${keys[1]}`
  },
  getValue: (event) => {
    // "proposals"|"proposals_v2", proposalId
    const keys = dbKeyToKeys(event.key, [false, true])
    return { proposalId: keys[1] }
  },
}

export const voteCast: Transformer = {
  codeIdsKeys: ['dao-proposal-single'],
  matches: (event) => event.key.startsWith(KEY_PREFIX_BALLOTS),
  name: (event) => {
    // "ballots", proposalId, address
    const keys = dbKeyToKeys(event.key, [false, true, false])
    return `voteCast:${keys[2]}:${keys[1]}`
  },
  getValue: (event) => {
    // "ballots", proposalId, address
    const keys = dbKeyToKeys(event.key, [false, true, false])

    return {
      proposalId: keys[1],
      vote: event.valueJson,
      votedAt: event.blockTimestamp.toISOString(),
    }
  },
}
