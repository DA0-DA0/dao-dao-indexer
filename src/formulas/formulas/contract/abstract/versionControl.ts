/*
    pub const CONFIG: Item<Config> = Item::new("cfg");

    // Modules waiting for approvals
    pub const PENDING_MODULES: Map<&ModuleInfo, ModuleReference> = Map::new("pendm");
    // We can iterate over the map giving just the prefix to get all the versions
    pub const REGISTERED_MODULES: Map<&ModuleInfo, ModuleReference> = Map::new("lib");
    // Reverse map for module info of standalone modules
    pub const STANDALONE_INFOS: Map<u64, ModuleInfo> = Map::new("stli");
    // Yanked Modules
    pub const YANKED_MODULES: Map<&ModuleInfo, ModuleReference> = Map::new("yknd");
    // Modules Configuration
    pub const MODULE_CONFIG: Map<&ModuleInfo, ModuleConfiguration> = Map::new("cfg");
    // Modules Default Configuration
    pub const MODULE_DEFAULT_CONFIG: Map<(&Namespace, &str), ModuleDefaultConfiguration> =
        Map::new("dcfg");
    /// Maps Account ID to the address of its core contracts
    pub const ACCOUNT_ADDRESSES: Map<&AccountId, AccountBase> = Map::new("accs");
*/

import semver from 'semver/preload'

import { Module } from '@/formulas/formulas/contract/abstract/types/versionControl'
import { ContractFormula } from '@/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils'

import { VersionControlTypes } from './types'

const VersionControlStorageKeys = {
  CONFIG: 'cfg',
  PENDING_MODULES: 'pendm',
  REGISTERED_MODULES: 'lib',
  STANDALONE_INFOS: 'stli',
  YANKED_MODULES: 'yknd',
  MODULE_CONFIG: 'cfg',
  MODULE_DEFAULT_CONFIG: 'dcfg',
  ACCOUNT_ADDRESSES: 'accs',
}

export const listRegisteredModules: ContractFormula<Array<Module>> = {
  compute: async ({ contractAddress, getMap }) => {
    const registeredModulesMap =
      (await getMap<string, VersionControlTypes.ModuleReference>(
        contractAddress,
        VersionControlStorageKeys.REGISTERED_MODULES,
        { keyType: 'raw' }
      )) ?? {}

    return Object.entries(registeredModulesMap).map(([key, reference]) => {
      const [namespace, name, version] = dbKeyToKeys(key, [
        false,
        false,
        false,
      ]) as string[]

      const info: VersionControlTypes.ModuleInfo = {
        namespace,
        name,
        version: { version },
      }
      return {
        info,
        reference,
      }
    })
  },
}

const moduleInfoToKey = ({
  namespace,
  name,
  version,
}: VersionControlTypes.ModuleInfo | ModuleInfoParameter): string => {
  const versionKey = version
    ? typeof version === 'string'
      ? version
      : version.version
    : 'latest'
  return dbKeyForKeys(namespace, name, versionKey)
}

const DEFAULT_MODULE_CONFIG: VersionControlTypes.ModuleConfiguration = {
  monetization: 'none',
  instantiation_funds: [],
}

type ModuleInfoParameter = Omit<VersionControlTypes.ModuleInfo, 'version'> & {
  version?: string
}

export const moduleConfig: ContractFormula<
  VersionControlTypes.ModuleConfiguration | undefined,
  ModuleInfoParameter
> = {
  compute: async ({ contractAddress, getMap, args }) => {
    if (!args || !args.name || !args.namespace) return undefined
    const moduleInfo: VersionControlTypes.ModuleInfo = {
      namespace: args.namespace,
      name: args.name,
      version: args.version ? { version: args.version } : 'latest',
    }

    const versionedConfigMap =
      (await getMap<string, VersionControlTypes.ModuleConfiguration>(
        contractAddress,
        VersionControlStorageKeys.CONFIG,
        {
          keyType: 'raw',
        }
      )) ?? {}

    const moduleConfig =
      versionedConfigMap[moduleInfoToKey(moduleInfo)] ?? DEFAULT_MODULE_CONFIG

    if (moduleConfig.metadata) {
      return moduleConfig
    }

    const defaultConfigMap =
      (await getMap<string, { metadata: string }>(
        contractAddress,
        VersionControlStorageKeys.MODULE_DEFAULT_CONFIG,
        {
          keyType: 'raw',
        }
      )) ?? {}

    let moduleDefaultConfig =
      defaultConfigMap[dbKeyForKeys(args.namespace, args.name)]

    return {
      ...moduleConfig,
      metadata: moduleDefaultConfig?.metadata,
    }
  },
}

export const module: ContractFormula<
  VersionControlTypes.ModuleResponse | undefined,
  ModuleInfoParameter
> = {
  compute: async (env) => {
    const { args } = env
    if (!args || !args.namespace || !args.name) return undefined
    const moduleParam = args as ModuleInfoParameter

    const registeredModules = await listRegisteredModules.compute(env)

    const filteredModules = registeredModules.filter(
      ({ info: { name, namespace } }) => {
        return namespace === moduleParam.namespace && name === moduleParam.name
      }
    )

    let foundModule = undefined

    // Find the latest version of the module
    if (!moduleParam.version || moduleParam.version === 'latest') {
      const sortedVersions = filteredModules.sort(
        ({ info: { version: versionA } }, { info: { version: versionB } }) => {
          if (typeof versionA === 'string' || typeof versionB === 'string') {
            throw new Error('Cannot compare "latest" versions')
          }
          return semver.compare(versionA.version, versionB.version)
        }
      )
      foundModule = sortedVersions[sortedVersions.length - 1]
    }

    // Get the proper module version
    foundModule = filteredModules.find(
      ({ info: { version } }) =>
        (typeof version === 'string' ? version : version.version) ===
        (moduleParam as { version: string }).version
    )

    const foundConfig = await moduleConfig.compute(env)

    return (
      foundModule &&
      foundConfig && {
        module: foundModule,
        config: foundConfig,
      }
    )
  },
}
