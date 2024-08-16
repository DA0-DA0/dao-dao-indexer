import { MeilisearchIndexer } from '@/types'

import { daoProposals, daos } from './daos'
import { govProposalVotes, govProposals } from './gov'

// Add meilisearch indexers here.
export const meilisearchIndexers: MeilisearchIndexer[] = [
  daos,
  daoProposals,
  govProposals,
  govProposalVotes,
]
