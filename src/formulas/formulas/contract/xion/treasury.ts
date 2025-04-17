import { makeSimpleContractFormula } from '../../utils'
import { Addr, FeeConfig, GrantConfig, Params } from '@/formulas/formulas/contract/xion/types/Treasury.types'
import { ContractFormula } from '@/types'

const TreasuryStorageKeys = {
  GRANT_CONFIGS: 'grant_configs',
  FEE_CONFIG: 'fee_config',
  ADMIN: 'admin',
  PENDING_ADMIN: 'pending_admin',
  PARAMS: 'params',
}

export const grantConfigs: ContractFormula<Map<String, GrantConfig>> = {
  docs: {
    description: 'Get the treasury\'s grant configs by msg type url',
  },
  compute: async (env) => {
    const { contractAddress, getMap } = env
    const grantConfigsMap = (await getMap<string, GrantConfig>(
      contractAddress,
      TreasuryStorageKeys.GRANT_CONFIGS,
    )) ?? {}

    let responseMap = new Map<string, GrantConfig>

    Object.entries(grantConfigsMap)
      .map(
        ([msgTypeURL, grantConfig]) => {
          responseMap.set(msgTypeURL, grantConfig)
        },
      )

    return responseMap
  },
}

export const feeConfig = makeSimpleContractFormula<FeeConfig | null>({
  docs: {
    description: 'Get the fee sponsorship configuration for the treasury',
  },
  transformation: TreasuryStorageKeys.FEE_CONFIG,
  fallback: null,
})

export const admin = makeSimpleContractFormula<Addr | null>({
  docs: {
    description: 'Get the curent admin for the treasury',
  },
  transformation: TreasuryStorageKeys.ADMIN,
  fallback: null,
})

export const pendingAdmin = makeSimpleContractFormula<Addr | null>({
  docs: {
    description: 'Get the pending admin for the treasury',
  },
  transformation: TreasuryStorageKeys.PENDING_ADMIN,
  fallback: null,
})

export const params = makeSimpleContractFormula<Params | null>({
  docs: {
    description: 'Get the params for the treasury',
  },
  transformation: TreasuryStorageKeys.PARAMS,
  fallback: null,
})

