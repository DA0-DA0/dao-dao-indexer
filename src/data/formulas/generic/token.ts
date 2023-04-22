import { Op } from 'sequelize'

import { GenericFormula } from '@/core'

import { dao } from '../contract/voting/daoVotingNativeStaked'

// Get DAOs that use a native token denom as their governance token.
export const daos: GenericFormula<string[], { denom: string }> = {
  compute: async (env) => {
    const {
      args: { denom },
      getTransformationMatches,
      getCodeIdsForKeys,
    } = env

    if (!denom) {
      throw new Error('Missing denom')
    }

    // Get dao-voting-native-staked contracts that use this denom.
    const daoVotingNativeStakedContracts =
      (
        await getTransformationMatches(
          undefined,
          'config',
          {
            denom,
          },
          {
            [Op.in]: getCodeIdsForKeys('dao-voting-native-staked'),
          }
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // Get the DAO for each voting contract.
    const daos = (
      await Promise.all(
        daoVotingNativeStakedContracts.map((contractAddress) =>
          dao.compute({
            ...env,
            contractAddress,
          })
        )
      )
    ).filter(Boolean) as string[]

    return daos
  },
}
