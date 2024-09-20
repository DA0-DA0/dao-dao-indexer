import { AccountFormula } from '@/types'

import { info } from '../contract/common'
import { balance } from '../contract/external/cw20'

type ContractWithBalance = {
  contractAddress: string
  balance: string
}

export const list: AccountFormula<ContractWithBalance[]> = {
  compute: async (env) => {
    const { address, getTransformationMatches } = env

    // Potential cw20 contracts where the address has tokens.
    const matchingContracts =
      (await getTransformationMatches(
        undefined,
        `hasBalance:${address}`,
        true
      )) ?? []

    const [contractInfos, balances] = await Promise.all([
      Promise.all(
        matchingContracts.map(({ contractAddress }) =>
          info.compute({
            ...env,
            contractAddress,
          })
        )
      ),
      Promise.all(
        matchingContracts.map(({ contractAddress }) =>
          balance.compute({
            ...env,
            contractAddress,
            args: {
              address: env.address,
            },
          })
        )
      ),
    ])

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
