import { Job, Queue } from 'bullmq'

import { compute, serializeBlock } from '@/core'
import { PendingMeilisearchIndexUpdate } from '@/core/types'
import { getTypedFormula } from '@/data'
import { State } from '@/db'
import { getMeilisearchIndexName, loadMeilisearch } from '@/ms'

import { BaseQueue } from './base'
import { closeBullQueue, getBullQueue } from './connection'

export class SearchQueue extends BaseQueue<PendingMeilisearchIndexUpdate> {
  static queueName = 'search'

  static getQueue = () =>
    getBullQueue<PendingMeilisearchIndexUpdate>(this.queueName)
  static add = async (
    ...params: Parameters<Queue<PendingMeilisearchIndexUpdate>['add']>
  ) => (await this.getQueue()).add(...params)
  static addBulk = async (
    ...params: Parameters<Queue<PendingMeilisearchIndexUpdate>['addBulk']>
  ) => (await this.getQueue()).addBulk(...params)
  static close = () => closeBullQueue(this.queueName)

  async process({
    data: {
      index: indexName,
      update: {
        id,
        formula: { type, name, targetAddress, args = {} },
      },
    },
  }: Job<PendingMeilisearchIndexUpdate>): Promise<void> {
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

    await index.addDocuments([
      {
        id,
        block: block && serializeBlock(block),
        value,
      },
    ])
  }
}
