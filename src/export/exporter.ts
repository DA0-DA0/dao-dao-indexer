import { Op, Sequelize } from 'sequelize'

import { loadDb } from '../db'
import { Computation, Contract, Event, State } from '../db/models'
import { Transformation } from '../db/models/Transformation'
import { Exporter } from './types'

export const exporter: Exporter = async (events) => {
  const sequelize = await loadDb()
  const escape = (
    sequelize.getQueryInterface().queryGenerator as {
      escape: (a: string) => string
    }
  ).escape.bind(sequelize.getQueryInterface().queryGenerator)

  const state = await State.getSingleton()
  if (!state) {
    throw new Error('State not found while exporting')
  }

  const uniqueContracts = [
    ...new Set(events.map((event) => event.contractAddress)),
  ]

  // Ensure contract exists before creating events. `address` is unique.
  await Contract.bulkCreate(
    uniqueContracts.map((address) => ({
      address,
      codeId: events.find((event) => event.contractAddress === address)!.codeId,
    })),
    {
      ignoreDuplicates: true,
    }
  )

  // Unique index on [blockHeight, contractAddress, key] ensures that we don't
  // insert duplicate events. If we encounter a duplicate, we update the
  // `value`, `valueJson`, and `delete` fields in case event processing for a
  // block was batched separately.
  const dbEvents = await Event.bulkCreate(events, {
    updateOnDuplicate: ['value', 'valueJson', 'delete'],
  })

  // Transform events as needed.
  const transformations = await Transformation.transformEvents(
    events.map((event, index) => ({
      ...event,
      eventId: dbEvents[index].id as number,
    }))
  )

  // Update validity of computations that depend on changed keys in two cases:
  //
  //    1. the computation starts being valid at a block after the earliest
  //       event block
  //    2. the computation starts being valid before the earliest event block
  //       and has been determined to be valid after the earliest event block
  //
  // In the first case, we need to destroy the computation because formulas can
  // depend on the first event where a key is set (usually to get dates for
  // events). We cannot verify the validity of the computation so it must be
  // recomputed later (next time it is requested).
  //
  // In the second case, we need to update the computation's validity because it
  // spans a range that includes an event that may have changed the computation.
  // This can happen if a computation is requested at a block that the exporter
  // has not yet reached and thus the block's events have not yet been exported.
  // We can update the computation's validity by checking the range from the
  // earliest event block to the computation's potentially incorrect value for
  // `latestBlockHeightValid`. This is safe because the computation is still
  // valid at its initial block—just its end block validity may need changing.

  const dependentEvents = Array.from(
    new Set(dbEvents.map((event) => event.dependentKey))
  )
  const dependentTransformations = Array.from(
    new Set(
      transformations.map((transformation) => transformation.dependentKey)
    )
  )
  // Same logic as in `getWhereClauseForDependentKeys` in
  // `src/db/models/Event.ts` and `src/db/models/Transformation.ts`.
  const contractAffectedComputationsWhereClause = {
    [Op.or]: [
      // Any dependent events that overlap with event keys.
      ...(dependentEvents.length > 0
        ? [
            {
              dependentEvents: {
                [Op.overlap]: dependentEvents,
              },
            },
            {
              id: {
                // Event wildcards and map prefixes. Any dependent keys that
                // contain a wildcard match or are map prefixes of changed keys.
                // If dependent keys do not start with a contract address, match
                // any contract address.
                [Op.in]: Sequelize.literal(`
                  (
                    SELECT
                      "Computations".id
                    FROM
                      "Computations",
                      unnest("Computations"."dependentEvents") keys(x)
                    INNER JOIN
                      unnest(ARRAY[${dependentEvents
                        .map((key) => escape(key))
                        .join(',')}]) event_keys(x)
                    ON
                      (
                        keys.x LIKE '%\\%%'
                        AND
                        event_keys.x LIKE keys.x
                      )
                      OR
                      (
                        keys.x LIKE '%,'
                        AND
                        event_keys.x LIKE keys.x || '%'
                      )
                  )
                `),
              },
            },
          ]
        : []),
      // Any dependent transformations that overlap with transformation keys.
      ...(dependentTransformations.length > 0
        ? [
            {
              dependentTransformations: {
                [Op.overlap]: dependentTransformations,
              },
            },
            {
              // Transformation wildcards.
              id: {
                [Op.in]: Sequelize.literal(`
                  (
                    SELECT
                      "Computations".id
                    FROM
                      "Computations",
                      unnest("Computations"."dependentTransformations") keys(x)
                    INNER JOIN
                      unnest(ARRAY[${dependentTransformations
                        .map((key) => escape(key))
                        .join(',')}]) transformation_keys(x)
                    ON
                      (
                        keys.x LIKE '%\\%%'
                        AND
                        transformation_keys.x LIKE keys.x
                      )
                  )
                `),
              },
            },
          ]
        : []),
    ],
  }

  const earliestEventBlockHeight = Math.min(
    ...events.map((event) => event.blockHeight)
  )

  // 1. Destroy those starting after the earliest event block.
  const computationsDestroyed = await Computation.destroy({
    where: {
      ...contractAffectedComputationsWhereClause,
      blockHeight: {
        [Op.gte]: earliestEventBlockHeight,
      },
    },
  })

  // 2. Update those starting before the earliest event block and deemed valid
  //    after the earliest event block.
  const safeToUpdateComputations = await Computation.findAll({
    where: {
      ...contractAffectedComputationsWhereClause,
      blockHeight: {
        [Op.lt]: earliestEventBlockHeight,
      },
      latestBlockHeightValid: {
        [Op.gte]: earliestEventBlockHeight,
      },
    },
  })
  await Promise.all(
    safeToUpdateComputations.map((computation) =>
      computation.updateValidityUpToBlockHeight(
        computation.latestBlockHeightValid,
        // Restart validity check at the earliest event block instead of the
        // default behavior of using the `latestBlockHeightValid` value.
        earliestEventBlockHeight
      )
    )
  )

  // Get updated contracts.
  const contracts = await Contract.findAll({
    where: {
      address: uniqueContracts,
    },
  })

  return {
    contracts,
    computationsUpdated: safeToUpdateComputations.length,
    computationsDestroyed,
    transformations: transformations.length,
  }
}
