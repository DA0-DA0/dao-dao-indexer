import { Op } from 'sequelize'

import { WalletFormula } from '@/core'

export const memberOf: WalletFormula<string[]> = {
  compute: async (env) => {
    const { walletAddress, getTransformationMatches, getTransformationMatch } =
      env

    // cw20-stake contracts where the address has a staked balance.
    const cw20StakeContracts =
      (
        await getTransformationMatches(
          undefined,
          `stakedBalance:${walletAddress}`
        )
      )
        ?.filter(({ value }) => !!value && value !== '0')
        .map(({ contractAddress }) => contractAddress) ?? []

    // dao-voting-cw20-staked contracts using one of the cw20-stake contracts.
    const daoVotingCw20StakedContracts =
      (
        await getTransformationMatches(undefined, 'stakingContract', {
          [Op.in]: cw20StakeContracts,
        })
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // DAO addresses for the dao-voting-cw20-staked contracts.
    const cw20StakedBalancesDaoAddresses = (
      await Promise.all(
        daoVotingCw20StakedContracts.map((contractAddress) =>
          getTransformationMatch(contractAddress, 'dao')
        )
      )
    )?.flatMap((match) =>
      typeof match?.value === 'string' ? [match.value] : []
    )

    // dao-voting-cw4 contracts where the address has a user weight.
    const daoVotingCw4Contracts =
      (await getTransformationMatches(undefined, `userWeight:${walletAddress}`))
        ?.filter(({ value }) => !!value && value !== '0')
        .map(({ contractAddress }) => contractAddress) ?? []

    // DAO addresses for the dao-voting-cw4 contracts.
    const cw4DaoAddresses = (
      await Promise.all(
        daoVotingCw4Contracts.map((contractAddress) =>
          getTransformationMatch(contractAddress, 'daoAddress')
        )
      )
    )?.flatMap((match) =>
      typeof match?.value === 'string' ? [match.value] : []
    )

    return Array.from(
      new Set([...cw20StakedBalancesDaoAddresses, ...cw4DaoAddresses])
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
      {
        [Op.in]: getCodeIdsForKeys('dao-core'),
      }
    )

    return daoCoreContracts?.map(({ contractAddress }) => contractAddress) ?? []
  },
}
