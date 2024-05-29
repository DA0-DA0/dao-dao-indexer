import * as fs from 'fs'
import path from 'path'

import { WasmCodeService } from '@/wasmcodes/wasm-code.service'

import { Config } from './types'

// Constants.
export const CONFIG_FILE = path.join(process.cwd(), './config.json')

// Config
let config: Config
export const loadConfig = (configOverride?: string) => {
  if (!config) {
    const configPath = path.resolve(
      configOverride ?? process.env.CONFIG_FILE ?? CONFIG_FILE
    )

    if (!fs.existsSync(configPath)) {
      throw new Error(`Config not found (${configPath}).`)
    }

    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }

  return config
}

export const updateConfigWasmCodes = async (configToUpdate?: Config) => {
  const wasmCodeService = await WasmCodeService.newWithWasmCodesFromDB()
  updateConfigCodeIds(wasmCodeService.exportWasmCodes())

  if (configToUpdate) {
    configToUpdate.codeIds = config.codeIds
  }

  return configToUpdate
}

export const updateConfigCodeIds = async (
  codeIds: Record<string, number[] | undefined>
): Promise<void> => {
  config.codeIds = codeIds
}

/**
 * Get code IDs for a list of keys in the config.
 */
export const getCodeIdsForKeys = (...keys: string[]): number[] => {
  return WasmCodeService.getInstance().findWasmCodeIdsByKeys(...keys) ?? []
}
