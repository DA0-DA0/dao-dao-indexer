import { Op } from 'sequelize'

import { WalletFormula } from '@/core'

import { config } from '../contract/daoCore/base'

export const memberOf: WalletFormula<
  {
    dao: string
    config: any
  }[]
> = {
  compute: async (env) => {
    const {
      walletAddress,
      getTransformationMatches,
      getTransformationMatch,
      getCodeIdsForKeys,
    } = env

    // cw20-stake contracts where the address has a staked balance.
    const cw20StakeContracts =
      (
        await getTransformationMatches(
          undefined,
          `stakedBalance:${walletAddress}`,
          {
            [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '0' }],
          },
          getCodeIdsForKeys('cw20-stake')
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // dao-voting-cw20-staked contracts using one of the cw20-stake contracts.
    const daoVotingCw20StakedContracts =
      (
        await getTransformationMatches(
          undefined,
          'stakingContract',
          cw20StakeContracts,
          getCodeIdsForKeys('dao-voting-cw20-staked')
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // dao-voting-cw721-staked contracts where the address has staked NFTs.
    const daoVotingCw721StakedContracts =
      (
        await getTransformationMatches(
          undefined,
          `stakedCount:${walletAddress}`,
          {
            [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '0' }],
          },
          getCodeIdsForKeys('dao-voting-cw721-staked')
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // dao-voting-native-staked and dao-voting-token-staked contracts where the
    // address has a staked balance.
    const daoVotingTokenStakedContracts =
      (
        await getTransformationMatches(
          undefined,
          `stakedBalance:${walletAddress}`,
          {
            [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '0' }],
          },
          getCodeIdsForKeys(
            'dao-voting-native-staked',
            'dao-voting-token-staked'
          )
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // DAO addresses for all the contracts above.
    const tokenStakedBalancesDaoAddresses = (
      await Promise.all(
        [
          ...daoVotingCw20StakedContracts,
          ...daoVotingCw721StakedContracts,
          ...daoVotingTokenStakedContracts,
        ].map((contractAddress) =>
          getTransformationMatch(contractAddress, 'dao')
        )
      )
    )?.flatMap((match) =>
      typeof match?.value === 'string' && match.value ? [match.value] : []
    )

    // cw4-group contracts where the address has a user weight.
    const cw4GroupContracts =
      (
        await getTransformationMatches(
          undefined,
          `member:${walletAddress}`,
          {
            [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: 0 }],
          },
          getCodeIdsForKeys('cw4-group')
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // dao-voting-cw4 contracts that use any of these group contracts.
    const daoVotingCw4Contracts =
      (
        await getTransformationMatches(
          undefined,
          'groupContract',
          cw4GroupContracts
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // DAO addresses for the dao-voting-cw4 contracts.
    const cw4DaoAddresses = (
      await Promise.all(
        daoVotingCw4Contracts.map((contractAddress) =>
          getTransformationMatch(contractAddress, 'daoAddress')
        )
      )
    )?.flatMap((match) =>
      typeof match?.value === 'string' && match.value ? [match.value] : []
    )

    const daos = Array.from(
      new Set([...tokenStakedBalancesDaoAddresses, ...cw4DaoAddresses])
    )
    const configs = await Promise.all(
      daos.map((daoAddress) =>
        config.compute({ ...env, contractAddress: daoAddress })
      )
    )

    return configs.flatMap((config, index) =>
      config
        ? {
            dao: daos[index],
            config,
          }
        : []
    )
  },
}

export const adminOf: WalletFormula<string[]> = {
  compute: async ({
    walletAddress,
    getTransformationMatches,
    getCodeIdsForKeys,
  }) => {
    // DAO core contracts where the address is the admin.
    const daoCoreContracts = await getTransformationMatches(
      undefined,
      'admin',
      walletAddress,
      getCodeIdsForKeys('dao-core')
    )

    return daoCoreContracts?.map(({ contractAddress }) => contractAddress) ?? []
  },
}
