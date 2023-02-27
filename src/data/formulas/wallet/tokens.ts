import { WalletFormula } from '@/core'

import { info } from '../contract/common'
import { balance } from '../contract/external/cw20'

type ContractWithBalance = {
  contractAddress: string
  balance: string
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
      // Filter by those with cw20 in the contract name and with a >0 balance.
      .map(({ contractAddress }, index): ContractWithBalance | undefined =>
        contractInfos[index]?.contract?.includes('cw20') &&
        balances[index] !== '0'
          ? {
              contractAddress,
              balance: balances[index],
            }
          : undefined
      )
      .filter(
        (contractWithBalance): contractWithBalance is ContractWithBalance =>
          !!contractWithBalance
      )

    return contractsWithBalance
  },
}
