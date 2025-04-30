import * as fs from 'fs'
import path from 'path'

import { Config } from '@/types'

// Constants.
const CONFIG_FILE = path.join(process.cwd(), './config.json')

// Config
let config: Config | undefined
let configWatch: fs.FSWatcher | undefined

/**
 * Load the config, cache it, and watch for changes to the file.
 *
 * Call `stopConfigWatch` to stop watching for changes.
 */
export const loadConfig = (
  /**
   * Override the config file path.
   */
  configOverride?: string,
  /**
   * Callback to call when the config changes due to a file change.
   */
  onChange?: (config: Config) => void
) => {
  const configPath = path.resolve(
    configOverride ?? process.env.CONFIG_FILE ?? CONFIG_FILE
  )

  if (!config) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config not found (${configPath}).`)
    }

    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }

  if (!configWatch) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config not found (${configPath}).`)
    }

    // Listen for changes to the config file.
    configWatch = fs.watch(configPath, (event) => {
      if (event === 'change') {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        onChange?.(config!)
      }
    })
  }

  return config!
}

/**
 * Stop watching for changes to the config file.
 */
export const stopConfigWatch = () => {
  if (configWatch) {
    configWatch.close()
    configWatch = undefined
  }
}
