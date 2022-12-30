import { Transformer } from '../types'
import { dbKeyForKeys, dbKeyToKeys } from '../utils'

export const proposed: Transformer = {
  codeIdsKeys: ['dao-proposal-single'],
  matches: (event) =>
    // Starts with proposals or proposals_v2.
    (event.key.startsWith(dbKeyForKeys('proposals', '')) ||
      event.key.startsWith(dbKeyForKeys('proposals_v2', ''))) &&
    !!event.valueJson.proposer,
  getName: (event) => {
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
  matches: (event) => event.key.startsWith(dbKeyForKeys('ballots', '')),
  getName: (event) => {
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
