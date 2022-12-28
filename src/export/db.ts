import axios from 'axios'
import { Op, Sequelize, WhereOptions } from 'sequelize'

import { loadConfig } from '../config'
import { loadDb } from '../db'
import {
  Contract,
  ContractComputation,
  Event,
  State,
  WalletComputation,
} from '../db/models'
import { Exporter } from './types'

export const exporter: Exporter = async (events) => {
  await loadDb()

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

  const eventRecords = events.map((event) => {
    // Convert base64 value to utf-8 string, if present.
    const value =
      event.value && Buffer.from(event.value, 'base64').toString('utf-8')

    let valueJson = null
    if (!event.delete && value) {
      try {
        valueJson = JSON.parse(value ?? 'null')
      } catch {
        // Ignore parsing errors.
      }
    }

    return {
      contractAddress: event.contractAddress,
      blockHeight: event.blockHeight,
      blockTimeUnixMs: Math.round(event.blockTimeUnixMicro / 1000),
      blockTimestamp: new Date(event.blockTimeUnixMicro / 1000),
      // Convert base64 key to comma-separated list of bytes. See explanation in
      // `Event` model for more information.
      key: Buffer.from(event.key, 'base64').join(','),
      value,
      valueJson,
      delete: event.delete,
    }
  })

  // Unique index on [blockHeight, contractAddress, key] ensures that we don't
  // insert duplicate events. If we encounter a duplicate, we update the
  // `value`, `valueJson`, and `delete` fields in case event processing for a
  // block was batched separately.
  await Event.bulkCreate(eventRecords, {
    updateOnDuplicate: ['value', 'valueJson', 'delete'],
  })

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

  const eventKeys = Array.from(
    new Set(
      eventRecords.map((event) => `${event.contractAddress}:${event.key}`)
    )
  )
  const contractAffectedComputationsWhereClause =
    makeAffectedComputationsWhereClause('ContractComputations', eventKeys)
  const walletAffectedComputationsWhereClause =
    makeAffectedComputationsWhereClause('WalletComputations', eventKeys)

  const earliestEventBlockHeight = Math.min(
    ...eventRecords.map((event) => event.blockHeight)
  )

  // 1. Destroy those starting after the earliest event block.
  const computationsDestroyed =
    (await ContractComputation.destroy({
      where: {
        ...contractAffectedComputationsWhereClause,
        blockHeight: {
          [Op.gte]: earliestEventBlockHeight,
        },
      },
    })) +
    (await WalletComputation.destroy({
      where: {
        ...walletAffectedComputationsWhereClause,
        blockHeight: {
          [Op.gte]: earliestEventBlockHeight,
        },
      },
    }))

  // 2. Update those starting before the earliest event block and deemed valid
  //    after the earliest event block.
  const safeToUpdateComputations: (ContractComputation | WalletComputation)[] =
    [
      ...(await ContractComputation.findAll({
        where: {
          ...contractAffectedComputationsWhereClause,
          blockHeight: {
            [Op.lt]: earliestEventBlockHeight,
          },
          latestBlockHeightValid: {
            [Op.gte]: earliestEventBlockHeight,
          },
        },
      })),
      ...(await WalletComputation.findAll({
        where: {
          ...walletAffectedComputationsWhereClause,
          blockHeight: {
            [Op.lt]: earliestEventBlockHeight,
          },
          latestBlockHeightValid: {
            [Op.gte]: earliestEventBlockHeight,
          },
        },
      })),
    ]
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
  }
}

// Update db state. Returns latest block height for log.
export const updateState = async (): Promise<number> => {
  const { statusEndpoint } = await loadConfig()
  const { data } = await axios.get(statusEndpoint, {
    // https://stackoverflow.com/a/74735197
    headers: { 'Accept-Encoding': 'gzip,deflate,compress' },
  })

  const latestBlockHeight = Number(data.result.sync_info.latest_block_height)
  const latestBlockTimeUnixMs = Date.parse(
    data.result.sync_info.latest_block_time
  )

  // Update state singleton with latest information.
  await State.upsert({
    singleton: true,
    latestBlockHeight,
    latestBlockTimeUnixMs,
  })

  return latestBlockHeight
}

// Same logic as in `getWhereClauseForDependentKeys` in
// `src/db/models/Event.ts`.
const makeAffectedComputationsWhereClause = (
  tableName: string,
  eventKeys: string[]
): WhereOptions => ({
  [Op.or]: {
    // Any dependent keys that overlap with changed keys.
    dependentKeys: {
      [Op.overlap]: eventKeys,
    },
    // Any dependent keys that contain a wildcard match or are map prefixes of
    // changed keys. If dependent keys do not start with a contract address,
    // match any contract address. This query is safe from SQL injection because
    // keys are encoded as comma-separated numbers and are prefixed with an
    // alphanumeric contract address and a colon, so they cannot contain single
    // quotes and perform SQL injection.
    id: {
      [Op.in]: Sequelize.literal(`
        (
          SELECT
            "${tableName}".id
          FROM
            "${tableName}",
            unnest("${tableName}"."dependentKeys") keys(x)
          INNER JOIN
            unnest(ARRAY['${eventKeys.join("','")}']) event_keys(x)
          ON
            (
              keys.x LIKE '%\\%%'
              AND
              (
                (
                  keys.x LIKE '%:%'
                  AND
                  event_keys.x LIKE keys.x
                )
                OR
                (
                  keys.x NOT LIKE '%:%'
                  AND
                  event_keys.x LIKE '%:' || keys.x
                )
              )
            )
            OR
            (
              keys.x LIKE '%,'
              AND
              (
                (
                  keys.x LIKE '%:%'
                  AND
                  event_keys.x LIKE keys.x || '%'
                )
                OR
                (
                  keys.x NOT LIKE '%:%'
                  AND
                  event_keys.x LIKE '%:' || keys.x || '%'
                )
              )
            )
        )
      `),
    },
  },
})
