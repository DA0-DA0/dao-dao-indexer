import { Op, Sequelize } from 'sequelize'

import { ComputationDependentKey } from '@/core/types'
import { bigIntMax, bigIntMin } from '@/core/utils'

import { loadDb } from './connection'
import {
  Computation,
  ComputationDependency,
  StakingSlashEvent,
  WasmStateEvent,
  WasmStateEventTransformation,
  WasmTxEvent,
} from './models'
import { DependendableEventModel } from './types'

// TODO: Compute computation if the latest computation is no longer valid? Maybe we should have a separate task that constantly checks the validity of computations and updates them as needed?

// Update validity of computations dependent on changed keys in three ways:
//
//    1. the computation starts being valid at or after the earliest block
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
  dependableEvents: DependendableEventModel[]
): Promise<{
  updated: number
  destroyed: number
}> => {
  if (!dependableEvents.length) {
    return { updated: 0, destroyed: 0 }
  }

  const sequelize = await loadDb()
  const escape = (
    sequelize.getQueryInterface().queryGenerator as {
      escape: (a: string) => string
    }
  ).escape.bind(sequelize.getQueryInterface().queryGenerator)

  // Dependable events may be very long, so we don't want to spread them into a
  // call to `Math.min` and `Math.max` and potentially cause a stack overflow.
  // Use reduce instead to compute the min and max.
  const { earliestBlockHeight, latestBlockHeight } = dependableEvents.reduce(
    (acc, { block: { height } }) => ({
      earliestBlockHeight:
        acc.earliestBlockHeight === -1n
          ? height
          : bigIntMin(acc.earliestBlockHeight, height),
      latestBlockHeight:
        acc.latestBlockHeight === -1n
          ? height
          : bigIntMax(acc.latestBlockHeight, height),
    }),
    { earliestBlockHeight: -1n, latestBlockHeight: -1n }
  )

  const computationDependencyWhere = makeComputationDependencyWhere(
    escape,
    dependableEvents
  )

  // 1. Destroy those starting at or after the earliest block.
  const computationsToDestroy = await Computation.findAll({
    where: {
      blockHeight: {
        [Op.gte]: earliestBlockHeight,
      },
    },
    include: [
      {
        model: ComputationDependency,
        required: true,
        where: computationDependencyWhere,
      },
    ],
  })
  const destroyed = (
    await Promise.all(
      computationsToDestroy.map((computation) => computation.destroy())
    )
  ).length

  // 2. Update those starting before the earliest block and deemed valid after
  //    the earliest block.
  const toUpdateInRange = await Computation.findAll({
    where: {
      blockHeight: {
        [Op.lt]: earliestBlockHeight,
      },
      latestBlockHeightValid: {
        [Op.gte]: earliestBlockHeight,
      },
      validityExtendable: true,
    },
    include: [
      {
        model: ComputationDependency,
        required: true,
        where: computationDependencyWhere,
      },
    ],
  })

  await Promise.all(
    toUpdateInRange.map((computation) =>
      computation.updateValidityUpToBlockHeight(
        // Update the validity at least to the latest block height affected, to
        // prevent future validity checks.
        bigIntMax(
          BigInt(computation.latestBlockHeightValid),
          latestBlockHeight
        ),
        // Restart validity check at the earliest block instead of the default
        // behavior of using the `latestBlockHeightValid` value.
        earliestBlockHeight
      )
    )
  )

  // COMMENTING OUT FOR NOW: Too inefficient. Need to index Computation's
  // dependencies or rewrite dependency system.

  // // 3. Update those most recent which start before the earliest block and have
  // //    been deemed valid before the earliest block.
  // const toUpdateExtendingRange = await Computation.findAll({
  //   attributes: [
  //     // DISTINCT ON is not directly supported by Sequelize, so we need to cast
  //     // to unknown and back to string to insert this at the beginning of the
  //     // query. This ensures we use the most recent computation for the formula.
  //     Sequelize.literal(
  //       'DISTINCT ON("formula", "args", "targetAddress") \'\''
  //     ) as unknown as string,
  //     'id',
  //     'targetAddress',
  //     'blockHeight',
  //     'blockTimeUnixMs',
  //     'latestBlockHeightValid',
  //     'formula',
  //     'args',
  //     'dependentEvents',
  //     'dependentTransformations',
  //     'output',
  //   ],
  //   where: {
  //     ...makeWhereComputationsAffected(
  //       escape,
  //       dependentEvents,
  //       dependentTransformations,
  //       `"blockHeight" < ${earliestBlockHeight} AND "latestBlockHeightValid" < ${earliestBlockHeight}`
  //     ),
  //     blockHeight: {
  //       [Op.lt]: earliestBlockHeight,
  //     },
  //     latestBlockHeightValid: {
  //       [Op.lt]: earliestBlockHeight,
  //     },
  //     validityExtendable: true,
  //   },
  //   order: [
  //     // Need to be first so we can use DISTINCT ON.
  //     ['formula', 'ASC'],
  //     ['args', 'ASC'],
  //     ['targetAddress', 'ASC'],

  //     ['blockHeight', 'DESC'],
  //   ],
  // })

  // await Promise.all(
  //   toUpdateExtendingRange.map((computation) =>
  //     computation.updateValidityUpToBlockHeight(latestBlockHeight)
  //   )
  // )

  return {
    updated: toUpdateInRange.length, // + toUpdateExtendingRange.length,
    destroyed,
  }
}

// Related logic in `getWhereClauseForDependentKeys` in the various dependable
// event models.
const makeComputationDependencyWhere = (
  escape: (str: string) => string,
  dependableEvents: DependendableEventModel[]
) => {
  const dependentKeys = dependableEvents.map(({ dependentKey }) => dependentKey)

  return {
    [Op.or]: [
      // Exact matches.
      {
        key: {
          [Op.in]: dependentKeys,
        },
        prefix: false,
      },
      ...dependentKeys.flatMap((dependentKey) => [
        // Wildcards. Not prefixes.
        {
          [Op.and]: [
            Sequelize.literal(
              `${escape(
                dependentKey
              )} LIKE REPLACE("dependencies"."key", '*', '%')`
            ),
            {
              prefix: false,
            },
          ],
        },
        // Prefixes. May contain other wildcards.
        {
          [Op.and]: [
            Sequelize.literal(
              `${escape(
                dependentKey
              )} LIKE REPLACE("dependencies"."key", '*', '%') || '%'`
            ),
            {
              prefix: true,
            },
          ],
        },
      ]),
    ],
  }
}

export const getDependableEventModels =
  (): typeof DependendableEventModel[] => [
    WasmStateEvent,
    WasmStateEventTransformation,
    WasmTxEvent,
    StakingSlashEvent,
  ]

// Get the dependable event model for a given key based on its namespace.
export const getDependableEventModelForKey = (
  key: string
): typeof DependendableEventModel | undefined => {
  const namespace = key.split(':')[0]
  return getDependableEventModels().find(
    (model) => model.dependentKeyNamespace === namespace
  )
}

export const dependentKeyMatches = (
  a: ComputationDependentKey,
  b: ComputationDependentKey
) => a.key === b.key && a.prefix === b.prefix
