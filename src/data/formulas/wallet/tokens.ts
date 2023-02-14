import { WalletFormula } from '@/core'

import { info } from '../contract/common'

type ContractWithBalance = {
  contractAddress: string
  balance: string | undefined
}

export const list: WalletFormula<ContractWithBalance[]> = {
  compute: async (env) => {
    const { walletAddress, getTransformationMatches } = env

    // Potential cw20 contracts where the wallet address has tokens.
    const matchingContracts =
      (await getTransformationMatches(undefined, `balance:${walletAddress}`)) ??
      []

    const contractInfos = await Promise.all(
      matchingContracts.map(({ contractAddress }) =>
        info.compute({
          ...env,
          contractAddress,
        })
      )
    )

    const contractsWithBalance = matchingContracts
      // Filter by those with cw20 in the contract name.
      .filter((_, index) => contractInfos[index]?.contract?.includes('cw20'))
      .map(
        ({ contractAddress, value }): ContractWithBalance => ({
          contractAddress,
          balance: typeof value === 'string' ? value : undefined,
        })
      )

    return contractsWithBalance
  },
}