import { loadConfig } from '../config'
import { loadMeilisearch } from './client'

export const setupMeilisearch = async () => {
  const client = await loadMeilisearch()
  const {
    meilisearch: { indexes },
  } = await loadConfig()

  // Create indexes if they don't exist.
  for (const { index, filterableAttributes } of indexes) {
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
