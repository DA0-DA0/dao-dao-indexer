import { WasmStateEvent } from '@/db'
import { config as daoCoreConfig } from '@/formulas/formulas/contract/daoCore/base'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils'
import { WebhookMaker, WebhookType } from '@/webhooks'

const CW20_STAKE_CODE_IDS_KEY = 'cw20-stake'
const DAO_VOTING_CW4_CODE_IDS_KEY = 'dao-voting-cw4'
const DAO_VOTING_CW721_STAKED_CODE_IDS_KEY = 'dao-voting-cw721-staked'
const DAO_VOTING_NATIVE_STAKED_CODE_IDS_KEY = 'dao-voting-native-staked'
const DAO_VOTING_TOKEN_STAKED_CODE_IDS_KEY = 'dao-voting-token-staked'

// cw20-stake, dao-voting-native-staked, and dao-voting-token-staked
const KEY_PREFIX_STAKED_BALANCES = dbKeyForKeys('staked_balances', '')
// dao-voting-cw4
const KEY_PREFIX_USER_WEIGHTS = dbKeyForKeys('user_weights', '')
// dao-voting-cw721-staked
const KEY_PREFIX_NB = dbKeyForKeys('nb', '')

// Fire webhook when a user becomes a member of a DAO.
export const makeInboxJoinedDao: WebhookMaker<WasmStateEvent> = (
  config,
  state
) => ({
  filter: {
    EventType: WasmStateEvent,
    codeIdsKeys: [
      CW20_STAKE_CODE_IDS_KEY,
      DAO_VOTING_CW4_CODE_IDS_KEY,
      DAO_VOTING_CW721_STAKED_CODE_IDS_KEY,
      DAO_VOTING_NATIVE_STAKED_CODE_IDS_KEY,
      DAO_VOTING_TOKEN_STAKED_CODE_IDS_KEY,
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
  getValue: async (event, getLastEvent, env) => {
    // Only send if previously unset.
    const lastEvent = await getLastEvent()
    if (!lastEvent || lastEvent.delete) {
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
    // If dao-voting-cw721-staked, dao-voting-native-staked, or
    // dao-voting-token-staked...
    else if (
      env
        .getCodeIdsForKeys(
          DAO_VOTING_CW721_STAKED_CODE_IDS_KEY,
          DAO_VOTING_NATIVE_STAKED_CODE_IDS_KEY,
          DAO_VOTING_TOKEN_STAKED_CODE_IDS_KEY
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
        chainId: state.chainId,
        dao: daoAddress,
        name: daoConfig?.name,
        imageUrl: daoConfig?.image_url ?? undefined,
      },
    }
  },
})
