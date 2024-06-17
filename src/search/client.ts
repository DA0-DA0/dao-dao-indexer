import MeiliSearch from 'meilisearch'

import { loadConfig } from '@/core'

let msClient: MeiliSearch | undefined

export const loadMeilisearch = () => {
  if (!msClient) {
    const { meilisearch } = loadConfig()
    if (!meilisearch) {
      throw new Error('MeiliSearch config not found')
    }

    msClient = new MeiliSearch({
      host: meilisearch.host,
      apiKey: meilisearch.apiKey,
    })
  }

  return msClient
}
