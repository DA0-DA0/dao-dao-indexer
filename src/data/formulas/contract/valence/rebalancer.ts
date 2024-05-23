import { ContractFormula } from "@/core"
import { ParsedTarget, RebalancerConfig, RebalancerConfigResponse } from "./types"
import { REBALANCER_ADDR } from "."

export const config: ContractFormula<
  RebalancerConfigResponse | undefined
> = {
  compute: async ({ contractAddress: accountAddr, get }) => {
    // TODO: modify to transformer
    let config: RebalancerConfig | undefined = await get(
      REBALANCER_ADDR,
      'configs',
      accountAddr
    )

    if (config) {
      return {
        ...config,
        is_paused: false,
      }
    } else {
      let config: RebalancerConfig | undefined = await get(
        accountAddr,
        'paused_configs',
        accountAddr
      )
      if (config) {
        return {
          ...config,
          is_paused: true,
        }
      } else {
        return undefined
      }
    }
  },
}

export const targets: ContractFormula<ParsedTarget[] | undefined> = {
  compute: async ({ contractAddress: accountAddr, get }) => {
    // TODO: modify to transformer
    let config: RebalancerConfig | undefined = await get(
      REBALANCER_ADDR,
      'configs',
      accountAddr
    )

    if (config) {
      return config.targets
    } else {
      return undefined
    }
  },
}