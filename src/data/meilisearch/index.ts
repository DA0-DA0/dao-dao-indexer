import { MeilisearchIndexer } from '@/core'

import { daos, proposals } from './daos'

// Add meilisearch indexers here.
export const meilisearchIndexers: MeilisearchIndexer[] = [daos, proposals]
