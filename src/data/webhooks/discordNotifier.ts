import { WebhookMaker, WebhookType } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

import {
  activeProposalModules,
  config as daoCoreConfig,
} from '../formulas/contract/daoCore/base'
import { Status } from '../formulas/contract/proposal/types'
import { getDaoAddressForProposalModule } from './utils'

const CODE_IDS_KEYS = ['dao-proposal-single', 'dao-proposal-multiple']

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
    const daoAddress = await getDaoAddressForProposalModule(env)
    if (!daoAddress) {
      return
    }

    return {
      type: WebhookType.Url,
      url: `https://discord-notifier.dao-dao.workers.dev/${state.chainId}/${daoAddress}/notify`,
      method: 'POST',
    }
  },
  getValue: async (event, getLastValue, env) => {
    // Only fire the webhook the first time this exists.
    if ((await getLastValue()) !== null) {
      return
    }

    // Get DAO config and proposal modules for this DAO so we can retrieve the
    // DAO's name and the prefix for this proposal module.
    const daoAddress = await getDaoAddressForProposalModule(env)
    if (!daoAddress) {
      return
    }

    const daoConfig = await daoCoreConfig.compute({
      ...env,
      contractAddress: daoAddress,
    })
    const proposalModules = await activeProposalModules.compute({
      ...env,
      contractAddress: daoAddress,
    })
    const proposalModule = proposalModules?.find(
      (proposalModule) => proposalModule.address === event.contractAddress
    )

    if (!daoConfig || !proposalModule) {
      return
    }

    // "proposals"|"proposals_v2", proposalNum
    const [, proposalNum] = dbKeyToKeys(event.key, [false, true])
    const proposalId = `${proposalModule.prefix}${proposalNum}`

    return {
      apiKey: config.discordNotifierApiKey,
      data: {
        content:
          `:tada: ${daoConfig.name} — **Proposal ${proposalId}** :tada:\n` +
          config.daoDaoBase +
          `/dao/${daoAddress}/proposals/${proposalId}`,
      },
    }
  },
})
