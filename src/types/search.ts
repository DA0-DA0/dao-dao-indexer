import { State } from '@/db/models/State'

import { DependableEventModel } from './db'
import { FormulaType } from './formulas'

export type MeilisearchIndexer = {
  /**
   * Unique ID for this meilisearch indexer.
   */
  id: string
  /**
   * The name of the index.
   */
  index: string
  /**
   * If true, the index will automatically be updated when a matching event
   * occurs. If false, it must be updated manually. Default: true.
   */
  automatic?: boolean
  /**
   * The attributes of the index used for filtering.
   */
  filterableAttributes?: string[]
  /**
   * The attributes of the index used for sorting.
   */
  sortableAttributes?: string[]
  /**
   * The matching function that should trigger an index update using the formula
   * returned. Returning `undefined` or `false` will not update the index.
   */
  matches: (options: {
    event: DependableEventModel
    state: State
  }) =>
    | MeilisearchIndexUpdate
    | undefined
    | false
    | Promise<MeilisearchIndexUpdate | undefined | false>
  /**
   * The function to bulk update the index when manually updating.
   */
  getBulkUpdates?: () => Promise<MeilisearchIndexUpdate[]>
}

export type MeilisearchIndexUpdate = {
  /**
   * A unique ID for this document in the index. Others will be overwritten.
   */
  id: string
  /**
   * The formula that should be executed and stored in the index.
   */
  formula: {
    type: FormulaType
    name: string
    targetAddress: string
    args?: Record<string, string>
  }
}

/**
 * A pending index update queued in the worker.
 */
export type PendingMeilisearchIndexUpdate = {
  /**
   * The meilisearch index to update.
   */
  index: string
  /**
   * The update to apply.
   */
  update: MeilisearchIndexUpdate
}
