import MeiliSearch from 'meilisearch'

import { ConfigManager } from '@/config'

let msClient: MeiliSearch | undefined
let lastHost: string | undefined
let lastApiKey: string | undefined

export const loadMeilisearch = () => {
  if (!msClient) {
    const { meilisearch } = ConfigManager.load()
    if (!meilisearch) {
      throw new Error('MeiliSearch config not found')
    }

    lastHost = meilisearch.host
    lastApiKey = meilisearch.apiKey

    msClient = new MeiliSearch({
      host: lastHost,
      apiKey: lastApiKey,
    })

    // Update the meilisearch client when the config changes.
    ConfigManager.instance.onChange(async (config) => {
      if (!config.meilisearch) {
        throw new Error('MeiliSearch config not found')
      }

      if (
        config.meilisearch.host !== lastHost ||
        config.meilisearch.apiKey !== lastApiKey
      ) {
        msClient = new MeiliSearch({
          host: config.meilisearch.host,
          apiKey: config.meilisearch.apiKey,
        })

        lastHost = config.meilisearch.host
        lastApiKey = config.meilisearch.apiKey
      }
    })
  }

  return msClient
}
