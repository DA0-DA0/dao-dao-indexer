import { loadConfig } from '@/config'
import { ContractFormula } from '@/types'

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

export const owner: ContractFormula<GovernanceDetailsForString | undefined> = {
  docs: {
    description: 'Get the owner of the account',
  },
  compute: async ({ contractAddress, get }) => {
    return (
      (
        await get<AccountTypes.OwnershipForString>(
          contractAddress,
          AccountStorageKeys.OWNER
        )
      )?.owner ?? undefined
    )
  },
}

export const accountId: ContractFormula<AccountTypes.AccountId | undefined> = {
  docs: {
    description: 'Get accountId of the account',
  },
  compute: async ({ contractAddress, get }) => {
    return await get<AccountTypes.AccountId>(
      contractAddress,
      AccountStorageKeys.ACCOUNT_ID
    )
  },
}

export const suspensionStatus: ContractFormula<boolean | undefined> = {
  docs: {
    description: 'Get suspension status of the account',
  },
  compute: async ({ contractAddress, get }) => {
    return await get<boolean>(
      contractAddress,
      AccountStorageKeys.SUSPENSION_STATUS
    )
  },
}

export const info: ContractFormula<AccountTypes.AccountInfo | undefined> = {
  docs: {
    description: 'Get the account info',
  },
  compute: async ({ contractAddress, get }) => {
    return await get<AccountTypes.AccountInfo>(
      contractAddress,
      AccountStorageKeys.INFO
    )
  },
}

export const whitelistedModules: ContractFormula<Array<Addr> | undefined> = {
  docs: {
    description: 'Get a list of whitelisted modules',
  },
  compute: async ({ contractAddress, get }) => {
    return await get<Array<Addr>>(
      contractAddress,
      AccountStorageKeys.WHITELISTED_MODULES
    )
  },
}

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
