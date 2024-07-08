import { Op } from 'sequelize'

import { WalletFormula } from '@/types'

import { info } from '../contract'
import { config, votingModule } from '../contract/daoCore/base'
import { proposalCount } from '../contract/daoCore/proposals'
import { ContractInfo } from '../types'

export const memberOf: WalletFormula<
  {
    dao: string
    info: ContractInfo
    votingModule: string
    config: any
    proposalCount: number
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

    // oraichain-cw20-staking contracts where the address has a staked balance.
    const oraichainCw20StakingContracts =
      (
        await getTransformationMatches(
          undefined,
          `stakedBalance:*:${walletAddress}`,
          {
            [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '0' }],
          },
          getCodeIdsForKeys('oraichain-cw20-staking')
        )
      )?.map(
        ({ name, contractAddress }) =>
          // Map to <staking contract>:<token contract>.
          `${contractAddress}:${name.split(':')[1]}`
      ) ?? []

    // oraichain-cw20-staking-proxy-snapshot contracts for these contracts and
    // tokens.
    const oraichainCw20StakingProxySnapshotContracts =
      (oraichainCw20StakingContracts.length > 0 &&
        (
          await getTransformationMatches(
            undefined,
            'proxyFor',
            oraichainCw20StakingContracts,
            getCodeIdsForKeys('oraichain-cw20-staking-proxy-snapshot')
          )
        )?.map(({ contractAddress }) => contractAddress)) ||
      []

    // dao-voting-cw20-staked contracts using one of the cw20-stake or
    // oraichain-cw20-staking-proxy-snapshot contracts.
    const daoVotingCw20StakedContracts =
      (
        await getTransformationMatches(
          undefined,
          'stakingContract',
          [
            ...cw20StakeContracts,
            ...oraichainCw20StakingProxySnapshotContracts,
          ],
          getCodeIdsForKeys('dao-voting-cw20-staked')
        )
      )?.map(({ contractAddress }) => contractAddress) ?? []

    // dao-voting-cw721-staked and dao-voting-onft-staked contracts where the
    // address has staked NFTs.
    const daoVotingNftStakedContracts =
      (
        await getTransformationMatches(
          undefined,
          `stakedCount:${walletAddress}`,
          {
            [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '0' }],
          },
          getCodeIdsForKeys('dao-voting-cw721-staked', 'dao-voting-onft-staked')
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
          ...daoVotingNftStakedContracts,
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
    const daoStates = await Promise.all(
      daos.map((daoAddress) =>
        Promise.all([
          info.compute({ ...env, contractAddress: daoAddress }),
          config.compute({ ...env, contractAddress: daoAddress }),
          votingModule.compute({ ...env, contractAddress: daoAddress }),
          proposalCount.compute({ ...env, contractAddress: daoAddress }),
        ])
      )
    )

    return daoStates.flatMap(
      ([info, config, votingModule, proposalCount], index) =>
        info && config && votingModule
          ? {
              dao: daos[index],
              info,
              config,
              votingModule,
              proposalCount: proposalCount || 0,
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
