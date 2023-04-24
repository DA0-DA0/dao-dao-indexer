import { WebhookMaker, WebhookType } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

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
export const makeAddPendingFollow: WebhookMaker = (config, state) => ({
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
  endpoint: async (event, env) => {
    const [, walletAddress] = dbKeyToKeys(event.key, [false, false])

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

    return {
      type: WebhookType.Url,
      url: `https://following.daodao.zone/webhook/${state.chainId}/${walletAddress}/${daoAddress}`,
      method: 'POST',
      headers: {
        'x-api-key': config.followingDaosSecret,
      },
    }
  },
  getValue: async (_, getLastValue) => {
    // Only send if the first time this is set.
    if ((await getLastValue()) !== null) {
      return
    }

    // Always send webhook. All data is in URL parameters and headers.
    return ''
  },
})
