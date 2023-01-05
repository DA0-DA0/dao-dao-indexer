import { WebhookMaker } from '@/core'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

import { activeProposalModules } from '../formulas/contract/dao/daoCore'
import { dao } from '../formulas/contract/proposal/daoProposalSingle'
import { Status } from '../formulas/contract/proposal/types'

const CODE_IDS_KEYS = ['dao-proposal-single']

const KEY_PREFIX_PROPOSALS = dbKeyForKeys('proposals', '')
const KEY_PREFIX_PROPOSALS_V2 = dbKeyForKeys('proposals_v2', '')

// Fire webhook when a proposal is created.
export const makeProposalCreated: WebhookMaker = (config, state) => ({
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) =>
      // Starts with proposals or proposals_v2.
      (event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
        event.key.startsWith(KEY_PREFIX_PROPOSALS_V2)) &&
      event.valueJson.status === Status.Open,
  },
  endpoint: async (_, env) => {
    const daoAddress = await dao(env)
    if (!daoAddress) {
      return
    }

    return {
      url: `https://discord-notifier.dao-dao.workers.dev/${state.chainId}/${daoAddress}/notify`,
      method: 'POST',
    }
  },
  getValue: async (event, getLastEvent, env) => {
    // Only fire the webhook the first time this exists.
    if ((await getLastEvent()) !== null) {
      return
    }

    // Get proposal modules for this DAO so we can extract the prefix.
    const daoAddress = await dao(env)
    const proposalModules = daoAddress
      ? await activeProposalModules({
          ...env,
          contractAddress: daoAddress,
        })
      : undefined
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
      apiKey: config.discordNotifierApiKey,
      data: {
        content:
          `:tada: **Proposal ${proposalId}** :tada:\n` +
          config.daoDaoBase +
          `/dao/${daoAddress}/proposals/${proposalId}`,
      },
    }
  },
})
