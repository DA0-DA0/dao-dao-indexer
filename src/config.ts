import * as fs from 'fs'
import path from 'path'

import { Config } from './types'

// Constants.
export const INDEXER_ROOT = '/Users/noah/.juno/indexer'
export const CONFIG_FILE = path.join(INDEXER_ROOT, 'config.json')

// Config
let config: Config
export const loadConfig = async () => {
  if (!config) {
    if (!fs.existsSync(CONFIG_FILE)) {
      throw new Error(`Config not found (${CONFIG_FILE}).`)
    }

    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  }

  return config
}
