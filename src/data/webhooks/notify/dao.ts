import { WebhookMaker, WebhookType } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

import { config as daoCoreConfig } from '../../formulas/contract/daoCore/base'

const CW20_STAKE_CODE_IDS_KEY = 'cw20-stake'
const DAO_VOTING_CW4_CODE_IDS_KEY = 'dao-voting-cw4'
const DAO_VOTING_CW721_STAKED_CODE_IDS_KEY = 'dao-voting-cw721-staked'
const DAO_VOTING_NATIVE_STAKED_CODE_IDS_KEY = 'dao-voting-native-staked'

// cw20-stake and dao-voting-native-staked
const KEY_PREFIX_STAKED_BALANCES = dbKeyForKeys('staked_balances', '')
// dao-voting-cw4
const KEY_PREFIX_USER_WEIGHTS = dbKeyForKeys('user_weights', '')
// dao-voting-cw721-staked
const KEY_PREFIX_NB = dbKeyForKeys('nb', '')

// Fire webhook when a user becomes a member of a DAO.
export const makeInboxJoinedDao: WebhookMaker = (config, state) => ({
  filter: {
    codeIdsKeys: [
      CW20_STAKE_CODE_IDS_KEY,
      DAO_VOTING_CW4_CODE_IDS_KEY,
      DAO_VOTING_CW721_STAKED_CODE_IDS_KEY,
      DAO_VOTING_NATIVE_STAKED_CODE_IDS_KEY,
    ],
    matches: (event) =>
      (event.key.startsWith(KEY_PREFIX_STAKED_BALANCES) ||
        event.key.startsWith(KEY_PREFIX_USER_WEIGHTS) ||
        event.key.startsWith(KEY_PREFIX_NB)) &&
      !event.delete &&
      event.valueJson !== '0',
  },
  endpoint: (event) => {
    const [, walletAddress] = dbKeyToKeys(event.key, [false, false])

    return {
      type: WebhookType.Url,
      url: 'https://inbox.daodao.zone/add/bech32/' + walletAddress,
      method: 'POST',
      headers: {
        'x-api-key': config.inboxSecret,
      },
    }
  },
  getValue: async (event, getLastValue, env) => {
    // Only send if the first time this is set.
    if ((await getLastValue()) !== null) {
      return
    }

    // If cw20-stake...
    let daoAddress: string | undefined
    if (
      env
        .getCodeIdsForKeys(CW20_STAKE_CODE_IDS_KEY)
        .includes(event.contract.codeId)
    ) {
      // Get dao-voting-cw20-staked contract that uses this contract.
      const daoVotingCw20StakedAddress = (
        await env.getTransformationMatch(
          undefined,
          'stakingContract',
          event.contractAddress
        )
      )?.contractAddress

      if (daoVotingCw20StakedAddress) {
        // Get DAO from voting contract.
        const dao = (
          await env.getTransformationMatch(daoVotingCw20StakedAddress, 'dao')
        )?.value

        daoAddress = typeof dao === 'string' && !!dao ? dao : undefined
      }
    }
    // If dao-voting-cw4...
    else if (
      env
        .getCodeIdsForKeys(DAO_VOTING_CW4_CODE_IDS_KEY)
        .includes(event.contract.codeId)
    ) {
      // Get DAO from voting contract.
      const dao = (
        await env.getTransformationMatch(event.contractAddress, 'daoAddress')
      )?.value

      daoAddress = typeof dao === 'string' && !!dao ? dao : undefined
    }
    // If dao-voting-cw721-staked or dao-voting-native-staked...
    else if (
      env
        .getCodeIdsForKeys(
          DAO_VOTING_CW721_STAKED_CODE_IDS_KEY,
          DAO_VOTING_NATIVE_STAKED_CODE_IDS_KEY
        )
        .includes(event.contract.codeId)
    ) {
      // Get DAO from voting contract.
      const dao = (
        await env.getTransformationMatch(event.contractAddress, 'dao')
      )?.value

      daoAddress = typeof dao === 'string' && !!dao ? dao : undefined
    }

    // If could not find DAO address, do not send.
    if (!daoAddress) {
      return
    }

    const daoConfig = await daoCoreConfig.compute({
      ...env,
      contractAddress: daoAddress,
    })

    if (!daoConfig) {
      return
    }

    return {
      chainId: state.chainId,
      type: 'joined_dao',
      data: {
        dao: daoAddress,
        name: daoConfig?.name,
        imageUrl: daoConfig?.image_url ?? undefined,
      },
    }
  },
})
