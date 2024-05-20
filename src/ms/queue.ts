import { randomUUID } from 'crypto'

import * as Sentry from '@sentry/node'

import { PendingMeilisearchIndexUpdate, QueueName, getBullQueue } from '@/core'
import { meilisearchIndexers } from '@/data/meilisearch'
import { DependableEventModel, State } from '@/db'

/**
 * Queue index updates for a given event. Returns how many updates were queued.
 */
export const queueMeilisearchIndexUpdates = async (
  event: DependableEventModel
): Promise<number> => {
  const automaticIndexers = meilisearchIndexers.filter(
    ({ automatic = true }) => automatic
  )
  if (automaticIndexers.length === 0) {
    return 0
  }

  const state = await State.getSingleton()
  if (!state) {
    throw new Error('State not found.')
  }

  const pendingUpdates = (
    await Promise.all(
      automaticIndexers.map(async ({ id, matches }) => {
        try {
          return matches({
            event,
            state,
          })
        } catch (error) {
          console.error(error)
          Sentry.captureException(error, {
            tags: {
              type: 'failed-indexer-update-match',
              eventType: event.constructor.name,
            },
            extra: {
              index: id,
              event: event.toJSON(),
            },
          })
        }
      })
    )
  ).flatMap((update, index): PendingMeilisearchIndexUpdate | [] =>
    update
      ? {
          index: automaticIndexers[index].index,
          update,
        }
      : []
  )

  if (pendingUpdates.length) {
    const queue = getBullQueue<PendingMeilisearchIndexUpdate>(QueueName.Search)
    await queue.addBulk(
      pendingUpdates.map((data) => ({
        name: randomUUID(),
        data,
      }))
    )
  }

  return pendingUpdates.length
}
