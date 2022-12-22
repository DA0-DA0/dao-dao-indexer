import axios from 'axios'
import { Op, Sequelize } from 'sequelize'

import { loadConfig } from '../config'
import { loadDb } from '../db'
import { Computation, Contract, Event, State } from '../db/models'
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

  // Update validity of computations that depend on changed keys.
  const eventKeys = eventRecords.map(
    (event) => `${event.contractAddress}:${event.key}`
  )
  const invalidComputations = await Computation.findAll({
    where: {
      [Op.or]: {
        // Any dependent keys that overlap with changed keys.
        dependentKeys: {
          [Op.overlap]: eventKeys,
        },
        // Any dependent keys that are map prefixes of changed keys. This is
        // safe because keys are encoded as comma-separated numbers and are
        // prefixed with an alphanumeric contract address and a colon, so
        // they cannot contain single quotes and perform SQL injection.
        id: {
          [Op.in]: Sequelize.literal(`
            (
              SELECT
                "Computations".id
              FROM
                "Computations",
                unnest("Computations"."dependentKeys") prefixes(x)
              INNER JOIN
                unnest(ARRAY['${eventKeys.join("','")}']) keys(x)
              ON
                keys.x LIKE prefixes.x || '%'
              WHERE
                prefixes.x LIKE '%,'
            )
          `),
        },
      },
    },
  })

  // Ensure validity of computations that depend on changed keys if the created
  // events are newer. If the computations start in the future, destroy them,
  // because formulas can depend on the first event where a key is set (usually
  // to get dates for events), which is in the past.
  const earliestBlockHeight = Math.min(
    ...eventRecords.map((event) => event.blockHeight)
  )
  const latestBlockHeight = Math.max(
    ...eventRecords.map((event) => event.blockHeight)
  )

  // If the computation is valid up to a block height that is before the
  // earliest block height of the events, then it's safe to update it since its
  // validity based on all previous events remains the same.
  const safeToUpdateComputations = invalidComputations
    .filter(
      (computation) => computation.latestBlockHeightValid < earliestBlockHeight
    )
    .map((computation) =>
      computation.ensureValidityUpToBlockHeight(latestBlockHeight)
    )
  await Promise.all([
    ...safeToUpdateComputations,
    // Destroy computations that have been previously determined to be valid at
    // blocks above any potentially relevant events that were just exported,
    // because these events may affect the validity of those (in case they
    // access past key-first-set timestamps, for example), and thus they'll need
    // to be recomputed.
    safeToUpdateComputations.length < invalidComputations.length
      ? Computation.destroy({
          where: {
            id: invalidComputations
              .filter(
                (computation) =>
                  computation.latestBlockHeightValid >= earliestBlockHeight
              )
              .map((computation) => computation.id),
          },
        })
      : Promise.resolve(),
  ])

  // Return updated contracts.
  return Contract.findAll({
    where: {
      address: uniqueContracts,
    },
  })
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
