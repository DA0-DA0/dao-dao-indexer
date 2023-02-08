import { WebhookMaker } from '@/core'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

import { dao as daoProposalMultipleDao } from '../formulas/contract/proposal/daoProposalMultiple'
import { dao as daoProposalSingleDao } from '../formulas/contract/proposal/daoProposalSingle'

const CODE_IDS_KEY_SINGLE = 'dao-proposal-single'
const CODE_IDS_KEY_MULTIPLE = 'dao-proposal-multiple'

const KEY_PREFIX_BALLOTS = dbKeyForKeys('ballots', '')

// Broadcast to WebSockets when a vote is cast.
export const makeBroadcastVoteCast: WebhookMaker = (config, state) => ({
  filter: {
    codeIdsKeys: [CODE_IDS_KEY_SINGLE, CODE_IDS_KEY_MULTIPLE],
    matches: (event) => event.key.startsWith(KEY_PREFIX_BALLOTS),
  },
  endpoint: async (event, env) => {
    // Get DAO address.
    let daoAddress: string | undefined
    if (
      await env.contractMatchesCodeIdKeys(
        event.contractAddress,
        CODE_IDS_KEY_SINGLE
      )
    ) {
      daoAddress = await daoProposalSingleDao.compute({
        ...env,
        contractAddress: event.contractAddress,
      })
    } else if (
      await env.contractMatchesCodeIdKeys(
        event.contractAddress,
        CODE_IDS_KEY_MULTIPLE
      )
    ) {
      daoAddress = await daoProposalMultipleDao.compute({
        ...env,
        contractAddress: event.contractAddress,
      })
    }

    // If could not find DAO address, do not send.
    if (!daoAddress) {
      return
    }

    return {
      url: `https://ws.daodao.zone/${state.chainId}_${daoAddress}/broadcast`,
      method: 'POST',
      headers: {
        'x-api-key': config.websocketsSecret,
      },
    }
  },
  getValue: async (event) => {
    // "ballots", proposalId, voter
    const [, proposalId, voter] = dbKeyToKeys(event.key, [false, true, false])

    return {
      type: 'vote',
      data: {
        proposalId,
        voter,
      },
    }
  },
})
