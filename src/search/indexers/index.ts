import { MeilisearchIndexer } from '@/core'

import { daoProposals, daos } from './daos'
import { govProposals } from './gov'

// Add meilisearch indexers here.
export const meilisearchIndexers: MeilisearchIndexer[] = [
  daos,
  daoProposals,
  govProposals,
]
