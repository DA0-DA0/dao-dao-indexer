import * as fs from 'fs'
import path from 'path'

import { Config } from '@/types'

const DEFAULT_CONFIG_FILE = path.join(process.cwd(), './config.json')

/**
 * A config manager that supports reloading config from a file automatically.
 *
 * Usage:
 *
 * Load the config:
 * ```ts
 * const config = ConfigManager.load()
 * // replace config with a specific config file:
 * const config = ConfigManager.load('./config.custom.json')
 * ```
 *
 * Listen for config changes:
 * ```ts
 * const unwatch = ConfigManager.onChange((config) => {
 *   console.log('Config changed:', config)
 * })
 * // Stop listening for config changes:
 * unwatch()
 * ```
 */
export class ConfigManager {
  /**
   * Singleton instance.
   */
  private static _instance: ConfigManager

  /**
   * Path to the config file.
   */
  private configFile: string

  /**
   * Config.
   */
  private config: Config

  /**
   * File watcher.
   */
  private configWatch: fs.StatWatcher | undefined

  /**
   * Callbacks to call when the config changes.
   */
  private onChangeCallbacks: ((config: Config) => void | Promise<void>)[] = []

  private constructor() {
    this.configFile = process.env.CONFIG_FILE ?? DEFAULT_CONFIG_FILE
    // Redundant set since loadConfig() sets this.config, this just resolves a
    // class type error.
    this.config = this.loadConfig()
    this.watchConfigFile()
  }

  static get instance() {
    if (!this._instance) {
      this._instance = new ConfigManager()
    }
    return this._instance
  }

  /**
   * Load the config, optionally updating the config file. If no update is
   * passed, the existing config is returned.
   *
   * Returns the config.
   */
  static load(updateFile?: string) {
    const manager = ConfigManager.instance
    if (updateFile) {
      return manager.updateConfigFile(path.resolve(updateFile))
    } else {
      return manager.config
    }
  }

  /**
   * Update the config file, watch the new file, reload the config, and notify
   * listeners.
   *
   * Returns the new config.
   */
  updateConfigFile(file: string) {
    // If the config file did not change, do nothing.
    if (this.configFile === file) {
      return this.config
    }

    // Unwatch the current file.
    this.unwatchConfigFile()

    // Load config from the new file.
    this.configFile = file
    const config = this.loadConfig()

    // Watch the new file.
    this.watchConfigFile()

    return config
  }

  /**
   * Load config from the config file, notify listeners, and return it.
   */
  loadConfig() {
    if (!fs.existsSync(this.configFile)) {
      throw new Error(`Config not found at ${this.configFile}.`)
    }

    this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf-8'))

    this.notifyListeners()

    return this.config
  }

  /**
   * Notify listeners that the config has changed.
   */
  private notifyListeners() {
    return Promise.all(
      this.onChangeCallbacks.map(async (callback) => {
        try {
          await callback(this.config)
        } catch (err) {
          console.error('Error calling config change callback:', err)
        }
      })
    )
  }

  /**
   * Add a callback to be called when the config changes.
   *
   * Returns a function that can be used to remove the callback.
   */
  onChange(callback: (config: Config) => void | Promise<void>) {
    this.onChangeCallbacks.push(callback)
    return () => this.removeOnChange(callback)
  }

  /**
   * Remove a callback from the list of callbacks to be called when the config
   * changes.
   */
  removeOnChange(callback: (config: Config) => void | Promise<void>) {
    this.onChangeCallbacks = this.onChangeCallbacks.filter(
      (cb) => cb !== callback
    )
  }

  /**
   * Watch the config file for changes.
   */
  watchConfigFile() {
    this.configWatch = fs.watchFile(
      this.configFile,
      { interval: 5_000 },
      (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          console.log('Config changed, reloading...')
          this.loadConfig()
        }
      }
    )
  }

  /**
   * Stop watching the config file.
   */
  unwatchConfigFile() {
    if (this.configWatch) {
      fs.unwatchFile(this.configFile)
      this.configWatch = undefined
    }
  }
}
