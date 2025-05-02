import * as fs from 'fs'
import path from 'path'

import { Config } from '@/types'

const DEFAULT_CONFIG_FILE = path.join(process.cwd(), './config.json')

/**
 * A config manager that supports reloading config from a file automatically and
 * using environment variables when desired.
 *
 * If a config value is set to `env:KEY`, it will be replaced with the value of
 * the environment variable `KEY`.
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

  private constructor(configFile?: string) {
    this.configFile =
      configFile ?? process.env.CONFIG_FILE ?? DEFAULT_CONFIG_FILE
    // Redundant set since loadConfig() sets this.config, this just resolves a
    // class type error.
    this.config = this.loadConfig()
    this.watchConfigFile()
  }

  static get instance(): ConfigManager {
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
  static load(updateFile?: string): Config {
    if (!this._instance) {
      this._instance = new ConfigManager(updateFile)
      return this._instance.config
    } else if (updateFile) {
      return this._instance.updateConfigFile(path.resolve(updateFile))
    } else {
      return this._instance.config
    }
  }

  /**
   * Update the config file, watch the new file, reload the config, and notify
   * listeners.
   *
   * Returns the new config.
   */
  updateConfigFile(file: string): Config {
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
  loadConfig(): Config {
    if (!fs.existsSync(this.configFile)) {
      throw new Error(`Config not found at ${this.configFile}.`)
    }

    this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf-8'))
    this.replaceEnvVars(this.config)

    this.notifyListeners()

    return this.config
  }

  /**
   * Replace any values in the object that are set to `env:KEY` with the value
   * of the environment variable `KEY`, throwing an error if the environment
   * variable is empty. Use `envOptional:KEY` instead to allow empty
   *
   * Recursively replaces values in nested objects.
   */
  private replaceEnvVars(obj: any) {
    Object.entries(obj).forEach(([key, value]) => {
      if (!value) {
        return
      }

      if (typeof value === 'string') {
        if (value.startsWith('env:')) {
          const envKey = value.slice('env:'.length)
          const envValue = process.env[envKey]
          if (envValue) {
            obj[key] = envValue
          } else {
            throw new Error(
              `Environment variable ${envKey} required by config but not set.`
            )
          }
        } else if (value.startsWith('envOptional:')) {
          const envKey = value.slice('envOptional:'.length)
          const envValue = process.env[envKey]
          obj[key] = envValue
        }
      } else if (typeof value === 'object') {
        this.replaceEnvVars(value)
      }
    })
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
