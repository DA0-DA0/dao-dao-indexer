import { compute, loadConfig, serializeBlock } from '@/core'
import { getTypedFormula } from '@/data'
import { meilisearchIndexers } from '@/data/meilisearch'
import { State } from '@/db'

import { loadMeilisearch } from './client'
import { getMeilisearchIndexName } from './utils'

type UpdateIndexesOptions = {
  /**
   * Filter by index ID.
   */
  index?: string
}

export const updateIndexes = async ({
  index: filterIndex,
}: UpdateIndexesOptions = {}): Promise<number> => {
  const config = loadConfig()

  // If no meilisearch in config, nothing to update.
  if (!config.meilisearch) {
    return 0
  }

  const client = loadMeilisearch()

  // Update indexes with data from the latest block height.
  const state = await State.getSingleton()
  if (!state) {
    throw new Error('State not found while updating indexes')
  }

  let exported = 0

  for (const {
    id: indexId,
    index: indexName,
    getBulkUpdates,
  } of meilisearchIndexers) {
    // If no bulk updater, skip.
    if (!getBulkUpdates) {
      continue
    }

    // If filter index is provided and does not match, skip.
    if (filterIndex && filterIndex !== indexId) {
      continue
    }

    const index = client.index(getMeilisearchIndexName(state, indexName))

    // Get bulk updates.
    const updates = await getBulkUpdates()
    console.log(
      `[${indexId}] Found ${updates.length.toLocaleString()} updates. Computing...`
    )

    try {
      let documents = []
      // Compute updates in batches of 100.
      for (let i = 0; i < updates.length; i += 100) {
        documents.push(
          ...(await Promise.all(
            updates
              .slice(i, i + 100)
              .map(
                async ({
                  id,
                  formula: { type, name, targetAddress, args = {} },
                }) => {
                  const typedFormula = getTypedFormula(type, name)
                  const { block, value } = await compute({
                    chainId: state.chainId,
                    targetAddress,
                    args,
                    block: state.latestBlock,
                    ...typedFormula,
                  })

                  return {
                    id,
                    block: block && serializeBlock(block),
                    value,
                  }
                }
              )
          ))
        )

        console.log(
          `[${indexId}] Finished computing ${documents.length.toLocaleString()}/${updates.length.toLocaleString()} updates...`
        )
      }

      await index.addDocuments(documents)

      exported += documents.length
    } catch (err) {
      console.error(`Error updating index ${indexId}:`, err)
    }
  }

  return exported
}
