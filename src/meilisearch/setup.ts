import { loadConfig } from '@/core'

import { loadMeilisearch } from './client'

export const setupMeilisearch = async () => {
  const { meilisearch } = loadConfig()

  // If no meilisearch in config, nothing to setup.
  if (!meilisearch) {
    return
  }

  const client = await loadMeilisearch()

  // Create indexes if they don't exist.
  for (const { index, filterableAttributes } of meilisearch.indexes) {
    try {
      const clientIndex = await client.getIndex(index)
      if (clientIndex.primaryKey !== 'contractAddress') {
        await clientIndex.update({
          primaryKey: 'contractAddress',
        })
      }
    } catch {
      await client.createIndex(index, {
        primaryKey: 'contractAddress',
      })
    }

    const clientIndex = client.index(index)

    await clientIndex.updateFilterableAttributes([
      'contractAddress',
      'codeId',
      'value',
      ...(filterableAttributes || []),
    ])
    await clientIndex.updateSortableAttributes(['blockHeight'])
  }
}
