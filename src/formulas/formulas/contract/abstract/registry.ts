import semver from 'semver/preload'

import { Module } from '@/formulas/formulas/contract/abstract/types/registry'
import { ContractFormula } from '@/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils'

import { RegistryTypes } from './types'

const RegistryStorageKeys = {
  CONFIG: 'cfg',
  PENDING_MODULES: 'ca',
  REGISTERED_MODULES: 'cb',
  STANDALONE_INFOS: 'cc',
  SERVICE_INFOS: 'cd',
  YANKED_MODULES: 'ce',
  MODULE_CONFIG: 'cf',
  MODULE_DEFAULT_CONFIG: 'cg',
  ACCOUNT_ADDRESSES: 'ch',
  LOCAL_ACCOUNT_SEQUENCE: 'ci',
  NAMESPACES: 'cj',
  REV_NAMESPACES: 'ck',
}

export const listRegisteredModules: ContractFormula<Array<Module>> = {
  docs: {
    description: 'Lists registered modules in registry',
  },
  compute: async ({ contractAddress, getMap }) => {
    const registeredModulesMap =
      (await getMap<string, RegistryTypes.ModuleReference>(
        contractAddress,
        RegistryStorageKeys.REGISTERED_MODULES,
        { keyType: 'raw' }
      )) ?? {}

    return Object.entries(registeredModulesMap).map(([key, reference]) => {
      const [namespace, name, version] = dbKeyToKeys(key, [
        false,
        false,
        false,
      ]) as string[]

      const info: RegistryTypes.ModuleInfo = {
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
}: RegistryTypes.ModuleInfo | ModuleInfoParameter): string => {
  const versionKey = version
    ? typeof version === 'string'
      ? version
      : version.version
    : 'latest'
  return dbKeyForKeys(namespace, name, versionKey)
}

const DEFAULT_MODULE_CONFIG: RegistryTypes.ModuleConfiguration = {
  monetization: 'none',
  instantiation_funds: [],
}

type ModuleInfoParameter = Omit<RegistryTypes.ModuleInfo, 'version'> & {
  version: string
}

export const moduleConfig: ContractFormula<
  RegistryTypes.ModuleConfiguration | undefined,
  ModuleInfoParameter
> = {
  docs: {
    description: 'Configuration of the module installation huh',
    args: [
      {
        name: 'name',
        description: 'name of the module',
        required: true,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'namespace',
        description: 'namespace of the module',
        required: true,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'version',
        description: 'semver version of the module',
        // TODO: it's possible to make it false with transformer and saving latest version of the module
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  compute: async ({ contractAddress, getMap, args }) => {
    if (!args || !args.name || !args.namespace || !args.version)
      return undefined
    const moduleInfo: RegistryTypes.ModuleInfo = {
      namespace: args.namespace,
      name: args.name,
      version: { version: args.version },
    }

    const versionedConfigMap =
      (await getMap<string, RegistryTypes.ModuleConfiguration>(
        contractAddress,
        RegistryStorageKeys.CONFIG,
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
        RegistryStorageKeys.MODULE_DEFAULT_CONFIG,
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
  RegistryTypes.ModuleResponse | undefined,
  ModuleInfoParameter
> = {
  docs: {
    description: 'Module info',
  },
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

export const listLocalAccounts: ContractFormula<RegistryTypes.AccountListResponse> =
  {
    docs: {
      description: 'Lists local accounts on chain',
    },
    compute: async ({ contractAddress, getMap }) => {
      const registeredModulesMap =
        (await getMap<string, string>(
          contractAddress,
          RegistryStorageKeys.ACCOUNT_ADDRESSES,
          { keyType: 'raw' }
        )) ?? {}

      const accounts = Object.entries(registeredModulesMap).map(
        ([key, reference]) => {
          const [trace_raw, sequence] = dbKeyToKeys(key, [false, true]) as [
            string,
            number
          ]

          const trace =
            trace_raw === 'local' ? 'local' : { remote: trace_raw.split('>') }
          return [
            {
              seq: sequence,
              trace,
            },
            reference,
          ] satisfies [RegistryTypes.AccountId, RegistryTypes.AccountForAddr]
        }
      )
      return { accounts }
    },
  }
