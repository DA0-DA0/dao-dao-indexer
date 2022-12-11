import { loadConfig } from '../config'
import { loadMeilisearch } from './client'

export const setupMeilisearch = async () => {
  const client = await loadMeilisearch()
  const {
    meilisearch: { outputs },
  } = await loadConfig()

  // Create indexes if they don't exist and set primaryKey to `contractAddress`.
  for (const { index } of outputs) {
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
  }
}
