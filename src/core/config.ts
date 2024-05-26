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
    config.wasmCodes = new WasmCodeService(config.codeIds)
  }

  return config
}

/**
 * Get code IDs for a list of keys in the config.
 */
export const getCodeIdsForKeys = (...keys: string[]): number[] => {
  const config = loadConfig()
  return config.wasmCodes?.findWasmCodeIdsByKeys(...keys) ?? []
}
