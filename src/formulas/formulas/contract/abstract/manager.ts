import { ContractFormula } from '@/types'

import * as Common from '../common'
import { ManagerTypes } from './types'

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

const ManagerStorageKeys = {
  CONFIG: 'config',
  INFO: 'info',
  OWNER: 'ownership',
  ACCOUNT_MODULES: 'modules',
  SUB_ACCOUNTS: 'sub_accs',
  IS_SUSPENDED: 'is_suspended',
  ACCOUNT_ID: 'acc_id',
}

export const owner: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) => {
    return (
      (
        await get<ManagerTypes.OwnershipForString>(
          contractAddress,
          ManagerStorageKeys.OWNER
        )
      )?.owner ?? undefined
    )
  },
}

export const accountId: ContractFormula<ManagerTypes.AccountId | undefined> = {
  compute: async ({ contractAddress, get }) => {
    return await get<ManagerTypes.AccountId>(
      contractAddress,
      ManagerStorageKeys.ACCOUNT_ID
    )
  },
}

export const suspensionStatus: ContractFormula<boolean | undefined> = {
  compute: async ({ contractAddress, get }) => {
    return await get<boolean>(contractAddress, ManagerStorageKeys.IS_SUSPENDED)
  },
}

export const info: ContractFormula<
  ManagerTypes.AccountInfoForAddr | undefined
> = {
  compute: async ({ contractAddress, get }) => {
    return await get<ManagerTypes.AccountInfoForAddr>(
      contractAddress,
      ManagerStorageKeys.INFO
    )
  },
}

export const config: ContractFormula<ManagerTypes.ConfigResponse | undefined> =
  {
    compute: async (env) => {
      const { contractAddress, get } = env
      const accId = await accountId.compute(env)
      const isSuspended = await suspensionStatus.compute(env)

      const config = await get<
        Pick<
          ManagerTypes.ConfigResponse,
          'version_control_address' | 'module_factory_address'
        >
      >(contractAddress, 'config')

      return (
        accId &&
        config && {
          account_id: accId,
          is_suspended: isSuspended ?? false,
          ...config,
        }
      )
    },
  }

export const subAccountIds: ContractFormula<ManagerTypes.AccountId[]> = {
  compute: async ({ contractAddress, getMap }) => {
    const subAccountsMap =
      (await getMap<number, {}>(
        contractAddress,
        ManagerStorageKeys.SUB_ACCOUNTS,
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
      ManagerTypes.ModuleInfosResponse['module_infos'][number],
      'version'
    > & { version: string | undefined }
  >
> = {
  compute: async (env) => {
    const { contractAddress, getMap, get } = env

    const versionControlAddr = await config
      .compute(env)
      .then((res) => res?.version_control_address)

    if (!versionControlAddr) return []

    const moduleAddressesMap =
      (await getMap<string, ManagerTypes.Addr>(
        contractAddress,
        ManagerStorageKeys.ACCOUNT_MODULES
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
