import {
  makeTransformer,
  makeTransformerForMap,
  makeTransformerForMapList,
} from '@/transformers/utils'
import { Transformer } from '@/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils/keys'

const CODE_IDS_KEYS: string[] = ['dao-vote-delegation']

const KEY_PREFIX_UDVP = dbKeyForKeys('udvp', '')

const config = makeTransformer(CODE_IDS_KEYS, 'config')
const vpCapPercent = makeTransformer(CODE_IDS_KEYS, 'vpc')
const dao = makeTransformer(CODE_IDS_KEYS, 'dao')
const proposalHookCallers = makeTransformerForMapList(
  CODE_IDS_KEYS,
  'proposalHookCallers',
  'phc'
)
const votingPowerHookCallers = makeTransformerForMapList(
  CODE_IDS_KEYS,
  'votingPowerHookCallers',
  'vphc'
)
const delegates = makeTransformerForMap(CODE_IDS_KEYS, 'delegate', 'delegates')
const unvotedDelegatedVotingPower: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) => event.key.startsWith(KEY_PREFIX_UDVP),
  },
  name: (event) => {
    // "udvp", delegate, proposalModule, proposalId
    const [, delegate, proposalModule, proposalId] = dbKeyToKeys(event.key, [
      false,
      false,
      false,
      true,
    ])
    return `unvotedDelegatedVotingPower:${delegate}:${proposalModule}:${proposalId}`
  },
  getValue: (event) => event.valueJson,
}
// TODO: transform wormhole (DELEGATED_VP)
// TODO: transform snapshot vector map (DELEGATIONS)

export default [
  config,
  dao,
  vpCapPercent,
  proposalHookCallers,
  votingPowerHookCallers,
  delegates,
  unvotedDelegatedVotingPower,
]
