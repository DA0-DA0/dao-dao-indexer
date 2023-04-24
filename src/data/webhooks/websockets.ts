import { Webhook, WebhookMaker, WebhookType } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'
import { State } from '@/db'

import { activeProposalModules } from '../formulas/contract/daoCore/base'
import { getDaoAddressForProposalModule } from './utils'

const CODE_IDS_KEY_SINGLE = 'dao-proposal-single'
const CODE_IDS_KEY_MULTIPLE = 'dao-proposal-multiple'

const KEY_PREFIX_BALLOTS = dbKeyForKeys('ballots', '')
const KEY_PREFIX_PROPOSALS = dbKeyForKeys('proposals', '')
const KEY_PREFIX_PROPOSALS_V2 = dbKeyForKeys('proposals_v2', '')

const makeWebSocketEndpoint =
  ({ chainId }: State): Webhook['endpoint'] =>
  async (_, env) => {
    // Get DAO address.
    const daoAddress = await getDaoAddressForProposalModule(env)
    if (!daoAddress) {
      return
    }

    return {
      type: WebhookType.Soketi,
      channel: `${chainId}_${daoAddress}`,
      event: 'broadcast',
    }
  }

// Broadcast to WebSockets when a vote is cast.
export const makeBroadcastVoteCast: WebhookMaker = (config, state) =>
  config.soketi && {
    filter: {
      codeIdsKeys: [CODE_IDS_KEY_SINGLE, CODE_IDS_KEY_MULTIPLE],
      matches: (event) => event.key.startsWith(KEY_PREFIX_BALLOTS),
    },
    endpoint: makeWebSocketEndpoint(state),
    getValue: async (event, _, env) => {
      // "ballots", proposalNum, voter
      const [, proposalNum, voter] = dbKeyToKeys(event.key, [
        false,
        true,
        false,
      ])

      // Get DAO address.
      const daoAddress = await getDaoAddressForProposalModule(env)
      if (!daoAddress) {
        return
      }

      // Get proposal module prefix from DAO's list.
      const proposalModules = await activeProposalModules.compute({
        ...env,
        contractAddress: daoAddress,
      })
      const proposalModule = proposalModules?.find(
        (proposalModule) => proposalModule.address === event.contractAddress
      )
      if (!proposalModule) {
        return
      }

      const proposalId = `${proposalModule.prefix}${proposalNum}`

      return {
        type: 'vote',
        data: {
          proposalId,
          voter,
        },
      }
    },
  }

// Broadcast to WebSockets when a proposal status changes, including creation.
export const makeProposalStatusChanged: WebhookMaker = (config, state) =>
  config.soketi && {
    filter: {
      codeIdsKeys: [CODE_IDS_KEY_SINGLE, CODE_IDS_KEY_MULTIPLE],
      matches: (event) =>
        event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
        event.key.startsWith(KEY_PREFIX_PROPOSALS_V2),
    },
    endpoint: makeWebSocketEndpoint(state),
    getValue: async (event, getLastValue, env) => {
      // Only fire the webhook when the status changes.
      const lastEvent = await getLastValue()
      if (lastEvent !== null && lastEvent.status === event.valueJson.status) {
        return
      }

      // Get DAO address.
      const daoAddress = await getDaoAddressForProposalModule(env)
      if (!daoAddress) {
        return
      }

      // Get proposal module prefix from DAO's list.
      const proposalModules = await activeProposalModules.compute({
        ...env,
        contractAddress: daoAddress,
      })
      const proposalModule = proposalModules?.find(
        (proposalModule) => proposalModule.address === event.contractAddress
      )
      if (!proposalModule) {
        return
      }

      // "proposals"|"proposals_v2", proposalNum
      const [, proposalNum] = dbKeyToKeys(event.key, [false, true])
      const proposalId = `${proposalModule.prefix}${proposalNum}`

      return {
        type: 'proposal',
        data: {
          proposalId,
          status: event.valueJson.status,
        },
      }
    },
  }
