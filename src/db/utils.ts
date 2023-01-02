import { Op, Sequelize } from 'sequelize'

import { loadDb } from './connection'
import { Computation, Event, Transformation } from './models'

// TODO: Compute computation if the latest computation is no longer valid? Maybe we should have a separate task that constantly checks the validity of computations and updates them as needed?

// Update validity of computations dependent on changed keys in three ways:
//
//    1. the computation starts being valid after the earliest block
//    2. the computation starts being valid before the earliest block and has
//       been determined to be valid after the earliest block
//    3. the most recent computation for a formula has been determined to be
//       valid before the earliest block
//
// In the first case, we need to destroy the computation because formulas can
// depend on the first event/transformation where a key is set (usually to get
// timestamps). We cannot verify the validity of the computation so it must be
// recomputed later (next time it is requested).
//
// In the second case, we need to update the computation's validity because it
// spans a range that includes a value that may have changed the computation.
// This can happen if a computation is requested at a block that the exporter
// has not yet reached and thus the block's events have not yet been exported
// and potentially transformed. We can update the computation's validity by
// checking the range from the earliest changed block to the computation's
// potentially incorrect value for `latestBlockHeightValid`. This is safe
// because the computation is still valid at its initial block—just its end
// block validity may need changing.
//
// In the third case, the most common case, we need to update the latest
// computation's validity because it has been determined to be valid before the
// earliest block and an event/transformation it has depended on in the past
// just updated. Doing this validation now speeds up queries by preventing the
// need for validation at the time the query is requested. We can update the
// computation's validity by checking the range up to the latest changed block,
// using the default behavior of starting from the `latestBlockHeightValid`.
export const updateComputationValidityDependentOnChanges = async (
  events: Event[],
  transformations: Transformation[]
): Promise<{
  updated: number
  destroyed: number
}> => {
  if (!events.length && !transformations.length) {
    return { updated: 0, destroyed: 0 }
  }

  const sequelize = await loadDb()
  const escape = (
    sequelize.getQueryInterface().queryGenerator as {
      escape: (a: string) => string
    }
  ).escape.bind(sequelize.getQueryInterface().queryGenerator)

  const dependentEvents = Array.from(
    new Set(events.map((event) => event.dependentKey))
  )
  const dependentTransformations = Array.from(
    new Set(
      transformations.map((transformation) => transformation.dependentKey)
    )
  )

  // Events and transformations may be very long, so we don't want to spread
  // them into a call to `Math.min` and potentially cause a stack overflow.
  const { earliestBlockHeight, latestBlockHeight } = [
    ...events,
    ...transformations,
  ].reduce(
    (acc, { blockHeight }) => ({
      earliestBlockHeight: Math.min(acc.earliestBlockHeight, blockHeight),
      latestBlockHeight: Math.max(acc.latestBlockHeight, blockHeight),
    }),
    { earliestBlockHeight: Infinity, latestBlockHeight: -Infinity }
  )

  // // 1. Destroy those starting after the earliest block.
  // const destroyed = await Computation.destroy({
  //   where: {
  //     ...makeWhereComputationsAffected(
  //       escape,
  //       dependentEvents,
  //       dependentTransformations,
  //       `"blockHeight" >= ${earliestBlockHeight}`
  //     ),
  //     blockHeight: {
  //       [Op.gte]: earliestBlockHeight,
  //     },
  //   },
  // })
  const destroyed = 0

  // 2. Update those starting before the earliest block and deemed valid after
  //    the earliest block.
  const toUpdateInRange = await Computation.findAll({
    where: {
      ...makeWhereComputationsAffected(
        escape,
        dependentEvents,
        dependentTransformations,
        `"blockHeight" < ${earliestBlockHeight} AND "latestBlockHeightValid" >= ${earliestBlockHeight}`
      ),
      blockHeight: {
        [Op.lt]: earliestBlockHeight,
      },
      latestBlockHeightValid: {
        [Op.gte]: earliestBlockHeight,
      },
    },
  })

  await Promise.all(
    toUpdateInRange.map((computation) =>
      computation.updateValidityUpToBlockHeight(
        // Update the validity at least to the latest block height affected, to
        // prevent future validity checks.
        Math.max(computation.latestBlockHeightValid, latestBlockHeight),
        // Restart validity check at the earliest block instead of the default
        // behavior of using the `latestBlockHeightValid` value.
        earliestBlockHeight
      )
    )
  )

  // 3. Update those most recent which start before the earliest block and have
  //    been deemed valid before the earliest block.
  const toUpdateExtendingRange = await Computation.findAll({
    attributes: [
      // DISTINCT ON is not directly supported by Sequelize, so we need to cast
      // to unknown and back to string to insert this at the beginning of the
      // query. This ensures we use the most recent computation for the formula.
      Sequelize.literal(
        'DISTINCT ON("formula", "args", "targetAddress") \'\''
      ) as unknown as string,
      'id',
      'targetAddress',
      'blockHeight',
      'blockTimeUnixMs',
      'latestBlockHeightValid',
      'formula',
      'args',
      'dependentEvents',
      'dependentTransformations',
      'output',
    ],
    where: {
      ...makeWhereComputationsAffected(
        escape,
        dependentEvents,
        dependentTransformations,
        `"blockHeight" < ${earliestBlockHeight} AND "latestBlockHeightValid" < ${earliestBlockHeight}`
      ),
      blockHeight: {
        [Op.lt]: earliestBlockHeight,
      },
      latestBlockHeightValid: {
        [Op.lt]: earliestBlockHeight,
      },
    },
    order: [
      // Need to be first so we can use DISTINCT ON.
      ['formula', 'ASC'],
      ['args', 'ASC'],
      ['targetAddress', 'ASC'],

      ['blockHeight', 'DESC'],
    ],
  })

  await Promise.all(
    toUpdateExtendingRange.map((computation) =>
      computation.updateValidityUpToBlockHeight(latestBlockHeight)
    )
  )

  return {
    updated: toUpdateInRange.length + toUpdateExtendingRange.length,
    destroyed,
  }
}

// Same logic as in `getWhereClauseForDependentKeys` in `src/db/models/Event.ts`
// and `src/db/models/Transformation.ts`.
const makeWhereComputationsAffected = (
  escape: (str: string) => string,
  dependentEvents: string[],
  dependentTransformations: string[],
  whereClause: string
) => ({
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
                      WHERE
                        ${whereClause}
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
            // Transformation wildcards and map prefixes.
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
                        OR
                        (
                          keys.x LIKE '%:'
                          AND
                          transformation_keys.x LIKE keys.x || '%'
                        )
                      WHERE
                        ${whereClause}
                    )
                  `),
            },
          },
        ]
      : []),
  ],
})
