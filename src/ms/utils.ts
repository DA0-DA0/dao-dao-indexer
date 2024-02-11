import { State } from '@/db'

/**
 * Combine state and index name into unique index name among all chains.
 */
export const getMeilisearchIndexName = (state: State, indexName: string) =>
  state.chainId + '_' + indexName
