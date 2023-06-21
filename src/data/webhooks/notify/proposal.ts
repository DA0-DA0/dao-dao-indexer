import { WebhookMaker, WebhookType } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

import {
  activeProposalModules,
  config as daoCoreConfig,
} from '../../formulas/contract/daoCore/base'
import { MultipleChoiceProposal } from '../../formulas/contract/proposal/daoProposalMultiple/types'
import { SingleChoiceProposal } from '../../formulas/contract/proposal/daoProposalSingle/types'
import { Status } from '../../formulas/contract/proposal/types'
import { getDaoAddressForProposalModule } from '../utils'

const CODE_IDS_KEYS = ['dao-proposal-single', 'dao-proposal-multiple']

const KEY_PREFIX_PROPOSALS = dbKeyForKeys('proposals', '')
const KEY_PREFIX_PROPOSALS_V2 = dbKeyForKeys('proposals_v2', '')

// Fire webhook when a proposal is created.
export const makeInboxProposalCreated: WebhookMaker = (config, state) => ({
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) =>
      // Starts with proposals or proposals_v2.
      (event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
        event.key.startsWith(KEY_PREFIX_PROPOSALS_V2)) &&
      event.valueJson.status === Status.Open,
  },
  endpoint: {
    type: WebhookType.Url,
    url: 'https://notifier.daodao.zone/notify',
    method: 'POST',
    headers: {
      'x-api-key': config.notifierSecret,
    },
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
    const proposal: SingleChoiceProposal | MultipleChoiceProposal =
      event.valueJson

    return {
      type: 'proposal_created',
      data: {
        chainId: state.chainId,
        dao: daoAddress,
        daoName: daoConfig.name,
        imageUrl: daoConfig.image_url ?? undefined,
        proposalId,
        proposalTitle: proposal.title,
      },
    }
  },
})
