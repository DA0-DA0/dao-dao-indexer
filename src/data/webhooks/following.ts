import { WebhookMaker } from '@/core'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

const CW20_STAKE_CODE_IDS_KEY = 'cw20-stake'
const DAO_VOTING_CW4_CODE_IDS_KEY = 'dao-voting-cw4'

const KEY_PREFIX_STAKED_BALANCES = dbKeyForKeys('staked_balances', '')
const KEY_PREFIX_USER_WEIGHTS = dbKeyForKeys('user_weights', '')

// Fire webhook when a cw20-stake balance or dao-voting-cw4 user weight is set.
export const addPendingFollow: WebhookMaker = (config, state) => ({
  filter: {
    codeIdsKeys: [CW20_STAKE_CODE_IDS_KEY, DAO_VOTING_CW4_CODE_IDS_KEY],
    matches: (event) =>
      (event.key.startsWith(KEY_PREFIX_STAKED_BALANCES) ||
        event.key.startsWith(KEY_PREFIX_USER_WEIGHTS)) &&
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

    // If could not find DAO address, do not send.
    if (!daoAddress) {
      return
    }

    return {
      url: `https://following-daos.dao-dao.workers.dev/webhook/${state.chainId}/${walletAddress}/${daoAddress}`,
      method: 'POST',
      headers: {
        'x-api-key': config.followingDaosSecret,
      },
    }
  },
  getValue: async (_, getLastEvent) => {
    // Only send if the first time this is set.
    if ((await getLastEvent()) !== null) {
      return
    }

    // Always send webhook. All data is in URL parameters and headers.
    return ''
  },
})
