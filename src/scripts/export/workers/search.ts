import { compute, serializeBlock } from '@/core'
import { PendingMeilisearchIndexUpdate, QueueName } from '@/core/types'
import { getTypedFormula } from '@/data'
import { State } from '@/db'
import { getMeilisearchIndexName, loadMeilisearch } from '@/ms'

import { ExportWorkerMaker } from '../types'

export const makeSearchWorker: ExportWorkerMaker<
  PendingMeilisearchIndexUpdate
> = async () => ({
  queueName: QueueName.Search,
  processor: async ({
    data: {
      index: indexName,
      update: {
        id,
        formula: { type, name, targetAddress, args = {} },
      },
    },
  }) => {
    const typedFormula = getTypedFormula(type, name)

    const state = await State.getSingleton()
    if (!state) {
      throw new Error('State not found.')
    }

    const index = loadMeilisearch().index(
      getMeilisearchIndexName(state, indexName)
    )

    const { block, value } = await compute({
      chainId: state.chainId,
      block: state.latestBlock,
      targetAddress,
      args,
      ...typedFormula,
    })

    return await index.addDocuments([
      {
        id,
        block: block && serializeBlock(block),
        value,
      },
    ])
  },
})
