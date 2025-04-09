import { WasmStateEvent } from '@/db'
import { WebhookMaker, WebhookType } from '@/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils'

const KEY_PREFIX_DVP = dbKeyForKeys('dvp', '')

// Broadcast to WebSockets when a delegate's total delegated VP changes.
export const makeDelegateVotingPowerChanged: WebhookMaker<WasmStateEvent> = (
  config,
  state
) =>
  config.soketi && {
    filter: {
      EventType: WasmStateEvent,
      codeIdsKeys: ['dao-vote-delegation'],
      matches: (event, env) => {
        if (!event.key.startsWith(KEY_PREFIX_DVP)) {
          return false
        }

        // "dvp", delegate, height
        const [, , height] = dbKeyToKeys(event.key, [false, false, true])

        // only match the event that is updating the height exactly two blocks
        // in the future. for every delegation update, there are multiple
        // updates to this same map in this TX, and we know that exactly one of
        // them will be the following block based on the usage of wormhole
        // during a delegation update. in the contract this is 1 block in the
        // future, but the indexer seems to run 1 block behind during export.
        return BigInt(height) === env.block.height + 2n
      },
    },
    endpoint: async (event) => {
      // "dvp", delegate, height
      const [, delegate] = dbKeyToKeys(event.key, [false, false, true])

      return {
        type: WebhookType.Soketi,
        channel: `delegate_${state.chainId}_${event.contractAddress}_${delegate}`,
        event: 'broadcast',
      }
    },
    getValue: async (event) => {
      // "dvp", delegate, height
      const [, delegate, height] = dbKeyToKeys(event.key, [false, false, true])

      return {
        type: 'delegated_vp_change',
        data: {
          delegate,
          height,
          power: event.valueJson,
        },
      }
    },
  }
