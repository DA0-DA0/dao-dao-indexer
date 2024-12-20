import { ContractFormula } from '@/types'

import { makeSimpleContractFormula } from '../../utils'
import * as Common from '../common'
import { AccountTypes } from './types'
import { Addr, GovernanceDetailsForString } from './types/account'

const AccountStorageKeys = {
  SUSPENSION_STATUS: 'aa',
  INFO: 'ab',
  ACCOUNT_MODULES: 'ac',
  DEPENDENTS: 'ad',
  SUB_ACCOUNTS: 'ae',
  WHITELISTED_MODULES: 'af',
  ACCOUNT_ID: 'ag',
  OWNER: 'ownership',
}

export const owner = makeSimpleContractFormula<
  { owner: GovernanceDetailsForString },
  GovernanceDetailsForString | null
>({
  docs: {
    description: 'Get the owner of the account',
  },
  transformation: AccountStorageKeys.OWNER,
  fallbackKeys: [AccountStorageKeys.OWNER],
  transform: (data) => data.owner,
  fallback: null,
})

export const accountId =
  makeSimpleContractFormula<AccountTypes.AccountId | null>({
    docs: {
      description: 'Get accountId of the account',
    },
    key: AccountStorageKeys.ACCOUNT_ID,
    fallback: null,
  })

export const suspensionStatus = makeSimpleContractFormula<boolean | null>({
  docs: {
    description: 'Get suspension status of the account',
  },
  key: AccountStorageKeys.SUSPENSION_STATUS,
  fallback: null,
})

export const info = makeSimpleContractFormula<AccountTypes.AccountInfo | null>({
  docs: {
    description: 'Get the account info',
  },
  key: AccountStorageKeys.INFO,
  fallback: null,
})

export const whitelistedModules = makeSimpleContractFormula<Addr[] | null>({
  docs: {
    description: 'Get a list of whitelisted modules',
  },
  key: AccountStorageKeys.WHITELISTED_MODULES,
  fallback: null,
})

export const subAccountIds: ContractFormula<AccountTypes.AccountId[]> = {
  docs: {
    description: 'Get sub-accounts owned by this account',
  },
  compute: async ({ contractAddress, getMap }) => {
    const subAccountsMap =
      (await getMap<number, {}>(
        contractAddress,
        AccountStorageKeys.SUB_ACCOUNTS,
        {
          keyType: 'number',
        }
      )) ?? {}

    return Object.keys(subAccountsMap).map((seq) => ({
      trace: 'local',
      seq: Number(seq),
    }))
  },
}

export const moduleInfos: ContractFormula<
  Array<
    Omit<
      AccountTypes.ModuleInfosResponse['module_infos'][number],
      'version'
    > & { version: string | undefined }
  >
> = {
  docs: {
    description: 'Get module infos that are installed on this account',
  },
  compute: async (env) => {
    const { contractAddress, getMap } = env

    const moduleAddressesMap =
      (await getMap<string, AccountTypes.Addr>(
        contractAddress,
        AccountStorageKeys.ACCOUNT_MODULES
      )) ?? {}

    // Query the info from the address of the module
    return await Promise.all(
      Object.entries(moduleAddressesMap).map(async ([moduleId, address]) => {
        const contractInfo = await Common.info.compute({
          ...env,
          contractAddress: address,
        })

        return {
          id: contractInfo?.contract ?? moduleId,
          address,
          version: contractInfo?.version,
        }
      })
    )
  },
}

// TODO: account txs
// export const accountTxs: ContractFormula<any> = {
//   docs: {
//     description: '',
//   },
//   compute: async (env) => {
//     const { contractAddress, getTxEvents } = env
//     const events = await getTxEvents(contractAddress)
//     return events || []
//   },
// }
