import { WalletFormula } from '@/core'

import { info } from '../contract/common'
import { balance } from '../contract/external/cw20'

type ContractWithBalance = {
  contractAddress: string
  balance: string | undefined
}

export const list: WalletFormula<ContractWithBalance[]> = {
  compute: async (env) => {
    const { walletAddress, getTransformationMatches } = env

    // Potential cw20 contracts where the wallet address has tokens.
    const matchingContracts =
      (await getTransformationMatches(
        undefined,
        `hasBalance:${walletAddress}`,
        true
      )) ?? []

    const contractInfos = await Promise.all(
      matchingContracts.map(({ contractAddress }) =>
        info.compute({
          ...env,
          contractAddress,
        })
      )
    )

    const balances = await Promise.all(
      matchingContracts.map(({ contractAddress }) =>
        balance.compute({
          ...env,
          contractAddress,
          args: {
            address: env.walletAddress,
          },
        })
      )
    )

    const contractsWithBalance = matchingContracts
      // Filter by those with cw20 in the contract name.
      .filter((_, index) => contractInfos[index]?.contract?.includes('cw20'))
      .map(
        ({ contractAddress }, index): ContractWithBalance => ({
          contractAddress,
          balance: balances[index],
        })
      )

    return contractsWithBalance
  },
}
