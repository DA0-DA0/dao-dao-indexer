import { ContractFormula } from '@/types'

import { ManagerTypes } from './types'

export const owner: ContractFormula<string | undefined> = {
  compute: async ({ contractAddress, get }) => {
    return (
      (await get<ManagerTypes.OwnershipForString>(contractAddress, 'ownership'))
        ?.owner ?? undefined
    )
  },
}

export const accountId: ContractFormula<ManagerTypes.AccountId | undefined> = {
  compute: async ({ contractAddress, get }) => {
    return await get<ManagerTypes.AccountId>(contractAddress, 'acc_id')
  },
}

export const suspensionStatus: ContractFormula<boolean | undefined> = {
  compute: async ({ contractAddress, get }) => {
    return await get<boolean>(contractAddress, 'is_suspended')
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

export const moduleInfos: ContractFormula<ManagerTypes.ModuleInfo[]> = {
  compute: async (env) => {
    const { contractAddress, getMap } = env

    const versionControl = await config.compute(env).then(res => res?.version_control_address)

    const modulesMap =
      (await getMap<string, Addr>(contractAddress, 'modules')) ?? {}
  },
}
