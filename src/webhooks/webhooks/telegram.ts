import { WasmStateEvent } from '@/db'
import {
  activeProposalModules,
  config as daoCoreConfig,
} from '@/formulas/formulas/contract/daoCore/base'
import { StatusEnum } from '@/formulas/formulas/contract/proposal/types'
import { WebhookMaker, WebhookType } from '@/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils'

import { getDaoAddressForProposalModule } from '../utils'

const CODE_IDS_KEYS = ['dao-proposal-single', 'dao-proposal-multiple']

const KEY_PREFIX_PROPOSALS = dbKeyForKeys('proposals', '')
const KEY_PREFIX_PROPOSALS_V2 = dbKeyForKeys('proposals_v2', '')

// Fire webhook when a proposal is created.
export const makeProposalCreated: WebhookMaker<WasmStateEvent> = (
  config,
  state
) => ({
  filter: {
    EventType: WasmStateEvent,
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) =>
      // Starts with proposals or proposals_v2.
      (event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
        event.key.startsWith(KEY_PREFIX_PROPOSALS_V2)) &&
      event.valueJson.status === StatusEnum.Open,
  },
  endpoint: async (event, env) => {
    const daoAddress = await getDaoAddressForProposalModule({
      ...env,
      contractAddress: event.contractAddress,
    })
    if (!daoAddress) {
      return
    }

    return {
      type: WebhookType.Url,
      url: `https://telegram-notifier.dao-dao.workers.dev/${state.chainId}/${daoAddress}/notify`,
      method: 'POST',
    }
  },
  getValue: async (event, getLastEvent, env) => {
    // Only fire the webhook the first time this exists.
    if ((await getLastEvent()) !== null) {
      return
    }

    // Get DAO config and proposal modules for this DAO so we can retrieve the
    // DAO's name and the prefix for this proposal module.
    const daoAddress = await getDaoAddressForProposalModule({
      ...env,
      contractAddress: event.contractAddress,
    })
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

    const daoUrl = config.daoDaoBase + `/dao/${daoAddress}`

    return {
      apiKey: config.telegramNotifierApiKey,
      daoName: daoConfig.name,
      proposalTitle: event.valueJson.title,
      proposalDescription: event.valueJson.description,
      proposalId,
      daoUrl,
      url: daoUrl + `/proposals/${proposalId}`,
    }
  },
})
