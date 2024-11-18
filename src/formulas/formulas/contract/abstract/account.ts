import { ContractFormula } from '@/types'

import * as Common from '../common'
import { AccountTypes } from './types'
import { Addr, GovernanceDetailsForString } from './types/account'

/*
    /// Suspension status
    pub const SUSPENSION_STATUS: Item<SuspensionStatus> = Item::new("\u{0}{12}is_suspended");
    /// Configuration
    pub const CONFIG: Item<Config> = Item::new("\u{0}{6}config");
    /// Info about the Account
    pub const INFO: Item<AccountInfo<Addr>> = Item::new("\u{0}{4}info");
    /// Account owner - managed by cw-ownable
    pub const OWNER: Item<Ownership<Addr>> = Item::new(OWNERSHIP_STORAGE_KEY);
    /// Enabled Abstract modules
    pub const ACCOUNT_MODULES: Map<ModuleId, Addr> = Map::new("modules");
    /// Stores the dependency relationship between modules
    /// map module -> modules that depend on module.
    pub const DEPENDENTS: Map<ModuleId, HashSet<String>> = Map::new("dependents");
    /// List of sub-accounts
    pub const SUB_ACCOUNTS: Map<u32, cosmwasm_std::Empty> = Map::new("sub_accs");
    /// Pending new governance
    pub const PENDING_GOVERNANCE: Item<GovernanceDetails<Addr>> = Item::new("pgov");
    /// Context for old adapters that are currently removing authorized addresses
    pub const REMOVE_ADAPTER_AUTHORIZED_CONTEXT: Item<u64> = Item::new("rm_a_auth");
}
 */

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
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
  },
  compute: async (env) => {
    const { contractAddress, getMap, get } = env

    // TODO:
    const RegistryAddr = undefined

    if (!RegistryAddr) return []

    const moduleAddressesMap =
      (await getMap<string, AccountTypes.Addr>(
        contractAddress,
        AccountStorageKeys.ACCOUNT_MODULES
      )) ?? {}

    // Query the info from
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

type State = {
  modules: string[]
}
