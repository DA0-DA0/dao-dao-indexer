import { GenericFormula } from '../../types'
import { dao as nativeDao } from '../contract/voting/daoVotingNativeStaked'
import { dao as tokenDao } from '../contract/voting/daoVotingTokenStaked'

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
          getCodeIdsForKeys('dao-voting-native-staked')
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // Get dao-voting-token-staked contracts that use this denom.
    const daoVotingTokenStakedContracts =
      (
        await getTransformationMatches(
          undefined,
          'denom',
          denom,
          getCodeIdsForKeys('dao-voting-token-staked')
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // Get the DAO for each voting contract.
    const daos = (
      await Promise.all([
        ...daoVotingNativeStakedContracts.map((contractAddress) =>
          nativeDao.compute({
            ...env,
            contractAddress,
          })
        ),
        ...daoVotingTokenStakedContracts.map((contractAddress) =>
          tokenDao.compute({
            ...env,
            contractAddress,
          })
        ),
      ])
    ).filter(Boolean) as string[]

    return daos
  },
}
