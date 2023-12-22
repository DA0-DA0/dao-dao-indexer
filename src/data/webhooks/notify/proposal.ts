import { WebhookMaker, WebhookType } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

import {
  activeProposalModules,
  config as daoCoreConfig,
} from '../../formulas/contract/daoCore/base'
import {
  dao as daoPreProposeBaseDao,
  proposalModule as daoPreProposeBaseProposalModule,
} from '../../formulas/contract/prePropose/daoPreProposeBase'
import { MultipleChoiceProposal } from '../../formulas/contract/proposal/daoProposalMultiple/types'
import { SingleChoiceProposal } from '../../formulas/contract/proposal/daoProposalSingle/types'
import { StatusEnum } from '../../formulas/contract/proposal/types'
import { getDaoAddressForProposalModule } from '../utils'

const PROPOSAL_CODE_IDS_KEYS = ['dao-proposal-single', 'dao-proposal-multiple']
const PRE_PROPOSE_APPROVAL_PROPOSAL_CODE_IDS_KEYS = [
  'dao-pre-propose-approval-single',
]

const APPROVER_CONTRACT_NAME = 'crates.io:dao-pre-propose-approver'

const KEY_PREFIX_PROPOSALS = dbKeyForKeys('proposals', '')
const KEY_PREFIX_PROPOSALS_V2 = dbKeyForKeys('proposals_v2', '')
const KEY_PREFIX_PENDING_PROPOSALS = dbKeyForKeys('pending_proposals', '')

// Fire webhook when a proposal is created.
export const makeInboxProposalCreated: WebhookMaker = (config, state) => ({
  filter: {
    codeIdsKeys: PROPOSAL_CODE_IDS_KEYS,
    matches: (event) =>
      // Starts with proposals or proposals_v2.
      (event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
        event.key.startsWith(KEY_PREFIX_PROPOSALS_V2)) &&
      event.valueJson.status === StatusEnum.Open,
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
      chainId: state.chainId,
      type: 'proposal_created',
      data: {
        chainId: state.chainId,
        dao: daoAddress,
        daoName: daoConfig.name,
        imageUrl: daoConfig.image_url ?? undefined,
        proposalId,
        proposalTitle: proposal.title,
        // Whether or not this is an approver-created proposal.
        fromApprover: proposalModule.info?.contract === APPROVER_CONTRACT_NAME,
      },
    }
  },
})

// Fire webhook when a proposal is executed.
export const makeInboxProposalExecuted: WebhookMaker = (config, state) => ({
  filter: {
    codeIdsKeys: PROPOSAL_CODE_IDS_KEYS,
    matches: (event) =>
      // Starts with proposals or proposals_v2.
      (event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
        event.key.startsWith(KEY_PREFIX_PROPOSALS_V2)) &&
      (event.valueJson.status === StatusEnum.Executed ||
        event.valueJson.status === StatusEnum.ExecutionFailed),
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
    // Only fire the webhook if the last event was not executed.
    const lastValue = await getLastValue()
    if (
      lastValue &&
      (lastValue.status === StatusEnum.Executed ||
        lastValue.status === StatusEnum.ExecutionFailed)
    ) {
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

    // Include winning option if multiple choice proposal.
    let winningOption: string | undefined
    if ('choices' in proposal && 'votes' in proposal) {
      // Pick choice with largest voting weight.
      const winningChoice = proposal.choices.reduce((curr, choice) => {
        const currentWeight = BigInt(proposal.votes.vote_weights[curr.index])
        const weight = BigInt(proposal.votes.vote_weights[choice.index])
        return currentWeight > weight ? curr : choice
      })
      winningOption = winningChoice?.title
    }

    return {
      chainId: state.chainId,
      type: 'proposal_executed',
      data: {
        chainId: state.chainId,
        dao: daoAddress,
        daoName: daoConfig.name,
        imageUrl: daoConfig.image_url ?? undefined,
        proposalId,
        proposalTitle: proposal.title,
        // Whether or not this is an approver-created proposal.
        fromApprover: proposalModule.info?.contract === APPROVER_CONTRACT_NAME,
        failed: event.valueJson.status === StatusEnum.ExecutionFailed,
        winningOption,
      },
    }
  },
})

// Fire webhook when a proposal is closed.
export const makeInboxProposalClosed: WebhookMaker = (config, state) => ({
  filter: {
    codeIdsKeys: PROPOSAL_CODE_IDS_KEYS,
    matches: (event) =>
      // Starts with proposals or proposals_v2.
      (event.key.startsWith(KEY_PREFIX_PROPOSALS) ||
        event.key.startsWith(KEY_PREFIX_PROPOSALS_V2)) &&
      event.valueJson.status === StatusEnum.Closed,
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
    // Only fire the webhook if the last event was not closed.
    const lastValue = await getLastValue()
    if (lastValue && lastValue.status === StatusEnum.Closed) {
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
      chainId: state.chainId,
      type: 'proposal_closed',
      data: {
        chainId: state.chainId,
        dao: daoAddress,
        daoName: daoConfig.name,
        imageUrl: daoConfig.image_url ?? undefined,
        proposalId,
        proposalTitle: proposal.title,
        // Whether or not this is an approver-created proposal.
        fromApprover: proposalModule.info?.contract === APPROVER_CONTRACT_NAME,
      },
    }
  },
})

// Fire webhook when a pending proposal that needs approval is created.
export const makeInboxPreProposeApprovalProposalCreated: WebhookMaker = (
  config,
  state
) => ({
  filter: {
    codeIdsKeys: PRE_PROPOSE_APPROVAL_PROPOSAL_CODE_IDS_KEYS,
    matches: (event) =>
      event.key.startsWith(KEY_PREFIX_PENDING_PROPOSALS) && !event.delete,
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
    const [daoAddress, proposalModuleAddress] = await Promise.all([
      daoPreProposeBaseDao.compute(env),
      daoPreProposeBaseProposalModule.compute(env),
    ])
    if (!daoAddress || !proposalModuleAddress) {
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
      (proposalModule) => proposalModule.address === proposalModuleAddress
    )

    if (!daoConfig || !proposalModule) {
      return
    }

    // "pending_proposals", proposalNum
    const [, proposalNum] = dbKeyToKeys(event.key, [false, true])
    const proposalId = `${proposalModule.prefix}*${proposalNum}`
    const proposalTitle = event.valueJson.msg.title

    return {
      chainId: state.chainId,
      type: 'pending_proposal_created',
      data: {
        chainId: state.chainId,
        dao: daoAddress,
        daoName: daoConfig.name,
        imageUrl: daoConfig.image_url ?? undefined,
        proposalId,
        proposalTitle,
      },
    }
  },
})
