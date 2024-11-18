import { AccountFormula } from '@/types'

import { info } from '../contract/common'
import { balance } from '../contract/external/cw20'

type ContractWithBalance = {
  contractAddress: string
  balance: string
}

export const list: AccountFormula<ContractWithBalance[]> = {
  docs: {
    description: 'retrieves a list of CW20 token balances for the account',
  },
  compute: async (env) => {
    const { address, getTransformationMatches } = env

    // Potential cw20 contracts where the address has tokens.
    const matchingContracts =
      (await getTransformationMatches(
        undefined,
        `hasBalance:${address}`,
        true
      )) ?? []

    const contractsWithBalance = (
      await Promise.all(
        matchingContracts.map(
          async ({
            contractAddress,
          }): Promise<ContractWithBalance | undefined> => {
            const [_contractInfo, _balance] = await Promise.allSettled([
              info.compute({
                ...env,
                contractAddress,
              }),
              balance.compute({
                ...env,
                contractAddress,
                args: {
                  address: env.address,
                },
              }),
            ])

            const contractName =
              _contractInfo.status === 'fulfilled'
                ? _contractInfo.value.contract
                : undefined
            const tokenBalance =
              _balance.status === 'fulfilled' ? _balance.value : '0'

            // Filter by those with cw20 in the contract name (or no name at
            // all) and with a >0 balance.
            return (!contractName || contractName.includes('cw20')) &&
              tokenBalance !== '0'
              ? {
                  contractAddress,
                  balance: tokenBalance,
                }
              : undefined
          }
        )
      )
    ).flatMap((result) => result || [])

    return contractsWithBalance
  },
}
