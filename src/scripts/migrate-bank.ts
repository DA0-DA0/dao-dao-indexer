import fs from 'fs'
import path from 'path'

import { Command } from 'commander'
import { Op } from 'sequelize'

import { ConfigManager } from '@/config'
import { BankStateEvent, Contract, loadDb } from '@/db'
import { WasmCodeService } from '@/services/wasm-codes'
import { BANK_HISTORY_CODE_IDS_KEYS } from '@/tracer/handlers/bank'
import { DbType } from '@/types'

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.option('-b, --batch <size>', 'batch size', '500')
program.option('-p, --parallel <count>', 'number of parallel workers', '5')
program.option('--no-delete-history', "don't delete history")
program.parse()
const { config: _config, batch, deleteHistory, parallel } = program.opts()

// Load config with config option.
ConfigManager.load(_config)

type Range = {
  startAfterAddress: string
  /**
   * Initialized to the startAfterAddress and updated as we process addresses.
   * Saves the progress of the worker.
   */
  lastProcessedAddress: string
  endAddress: string
}

const main = async () => {
  // Load DB on start.
  const sequelize = await loadDb({
    type: DbType.Data,
  })

  // Set up wasm code service.
  await WasmCodeService.setUpInstance()

  const allStartTime = Date.now()
  console.log(`\n[${new Date().toISOString()}] STARTING...\n`)

  // Ensuring address index exists.
  const indexStart = Date.now()
  console.log('creating indexes...')
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS bank_state_events_address ON "BankStateEvents" ("address")
  `)
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS bank_state_events_address_denom_block_height ON "BankStateEvents" ("address", "denom", "blockHeight" DESC)
  `)
  const indexDuration = (Date.now() - indexStart) / 1000
  console.log(`created indexes in ${indexDuration.toLocaleString()} seconds\n`)

  // Find addresses to keep history for
  let addressesToKeepHistoryFor: string[] = []
  if (deleteHistory) {
    const historyCodeIds = WasmCodeService.getInstance().findWasmCodeIdsByKeys(
      ...BANK_HISTORY_CODE_IDS_KEYS
    )
    addressesToKeepHistoryFor = historyCodeIds.length
      ? (
          await Contract.findAll({
            where: {
              codeId: historyCodeIds,
            },
            attributes: ['address'],
            raw: true,
          })
        ).map((contract) => contract.address)
      : []
    console.log(
      `keeping history for ${addressesToKeepHistoryFor.length.toLocaleString()} contracts`
    )
  }

  const getBankStateEventsSize = async () =>
    (
      (await sequelize.query(
        `SELECT pg_size_pretty(pg_total_relation_size('"BankStateEvents"'))`,
        { type: 'SELECT' }
      )) as unknown as [{ pg_size_pretty: string }]
    )[0].pg_size_pretty

  const bankStateEventsSizeBefore = await getBankStateEventsSize()

  const totalAddresses = await BankStateEvent.count({
    distinct: true,
    col: 'address',
  })
  console.log(
    `found ${totalAddresses.toLocaleString()} addresses to migrate in BankStateEvents table, size: ${bankStateEventsSizeBefore}\n`
  )

  if (totalAddresses > 0) {
    // Process in batches
    const batchSize = Number(batch)
    const parallelWorkers = Number(parallel)
    let totalProcessed = 0
    const rangeSaveFile = path.join(
      process.cwd(),
      `migrate-bank-ranges.workers-${parallelWorkers}.json`
    )

    // Get max address for the last range.
    const [{ maxAddress }] = (await sequelize.query(
      `SELECT MAX(address) as "maxAddress" FROM "BankStateEvents"`,
      { type: 'SELECT' }
    )) as unknown as [{ maxAddress: string }]

    let ranges: Range[] = []
    const saveRanges = () =>
      fs.writeFileSync(rangeSaveFile, JSON.stringify(ranges, null, 2))
    saveRanges()

    // Load the saved ranges.
    const savedRanges: Range[] = fs.existsSync(rangeSaveFile)
      ? JSON.parse(fs.readFileSync(rangeSaveFile, 'utf8'))
      : []

    // If saved ranges have the correct max address, just use the saved ranges.
    // No need to build new ranges.
    if (
      savedRanges.length > 0 &&
      savedRanges[savedRanges.length - 1].endAddress === maxAddress
    ) {
      ranges = savedRanges
    } else {
      const buildRangeStart = Date.now()
      console.log('building ranges...')

      // Get address boundaries based on row counts, not distinct addresses.
      const [addressBoundariesResult] = (await sequelize.query(
        `
        WITH address_counts AS (
          SELECT
            address,
            COUNT(*) as row_count
          FROM "BankStateEvents"
          GROUP BY address
          ORDER BY address
        ),
        address_with_running_total AS (
          SELECT 
            address,
            row_count,
            SUM(row_count) OVER (ORDER BY address) as running_total,
            (SELECT SUM(row_count) FROM address_counts) as total_rows
          FROM address_counts
        )
        SELECT address
        FROM address_with_running_total
        WHERE running_total > total_rows * generate_series(1, ${
          parallelWorkers - 1
        }, 1)::float / ${parallelWorkers}
        AND running_total - row_count <= total_rows * generate_series(1, ${
          parallelWorkers - 1
        }, 1)::float / ${parallelWorkers}
        ORDER BY running_total
        `,
        { type: 'SELECT' }
      )) as unknown as [{ address: string }[]]

      const addressBoundaries = addressBoundariesResult.map(
        (result) => result.address
      )

      // Build the ranges using the boundaries
      let startAfterAddress = ''

      // Add boundaries as end addresses for each range except the last
      for (const endAddress of addressBoundaries) {
        ranges.push({
          startAfterAddress,
          lastProcessedAddress: startAfterAddress,
          endAddress,
        })
        startAfterAddress = endAddress
      }

      // Add the final range
      ranges.push({
        startAfterAddress,
        lastProcessedAddress: startAfterAddress,
        endAddress: maxAddress,
      })

      // Update the lastProcessedAddress for any saved ranges that exist.
      savedRanges.forEach((savedRange: Range) => {
        const matchingRange = ranges.find(
          (range) =>
            range.startAfterAddress === savedRange.startAfterAddress &&
            range.endAddress === savedRange.endAddress
        )
        if (matchingRange) {
          matchingRange.lastProcessedAddress = savedRange.lastProcessedAddress
        }
      })

      saveRanges()

      const buildRangeDuration = (Date.now() - buildRangeStart) / 1000
      console.log(
        `built ranges in ${buildRangeDuration.toLocaleString()} seconds\n`
      )
    }

    const migrationStartTime = Date.now()
    const saveProgress = () =>
      console.log(
        `--- TOTAL: processed ${(
          (totalProcessed / totalAddresses) *
          100
        ).toFixed(
          4
        )}% (${totalProcessed.toLocaleString()}/${totalAddresses.toLocaleString()}) addresses (total ${(
          (Date.now() - migrationStartTime) /
          1000
        ).toLocaleString()} seconds)`
      )

    const processRange = async (range: Range, workerIndex: number) => {
      console.log(
        `[worker ${workerIndex + 1}] processing range from '${
          range.startAfterAddress
        }' to '${range.endAddress}'...`
      )

      const rangeTotalAddresses = await BankStateEvent.count({
        where: {
          address: {
            [Op.gt]: range.lastProcessedAddress,
            [Op.lte]: range.endAddress,
          },
        },
        distinct: true,
        col: 'address',
      })

      console.log(
        `[worker ${
          workerIndex + 1
        }] found ${rangeTotalAddresses.toLocaleString()} unmigrated addresses`
      )

      const workerStartTime = Date.now()
      let rangeProcessed = 0

      while (range.lastProcessedAddress !== range.endAddress) {
        const startTime = Date.now()

        // Process a batch of addresses using a CTE (Common Table Expression)
        const processedAddresses = (await sequelize.query(
          `
          WITH addresses_batch AS (
            SELECT DISTINCT address
            FROM "BankStateEvents"
            WHERE address > '${range.lastProcessedAddress}' AND address <= '${range.endAddress}'
            ORDER BY address
            LIMIT ${batchSize}
          ),
          inserted AS (
            INSERT INTO "BankBalances" (address, balances, "denomUpdateBlockHeights", "blockHeight", "blockTimeUnixMs", "blockTimestamp", "createdAt", "updatedAt")
            SELECT
              address,
              jsonb_object_agg(denom, balance) as balances,
              jsonb_object_agg(denom, "blockHeight") as "denomUpdateBlockHeights",
              MAX("blockHeight") as "blockHeight",
              MAX("blockTimeUnixMs") as "blockTimeUnixMs",
              MAX("blockTimestamp") as "blockTimestamp",
              NOW() as "createdAt",
              NOW() as "updatedAt"
            FROM (
              SELECT DISTINCT ON (address, denom) 
                address, denom, balance, "blockHeight", "blockTimeUnixMs", "blockTimestamp"
              FROM "BankStateEvents"
              WHERE address IN (SELECT address FROM addresses_batch)
              ORDER BY address, denom, "blockHeight" DESC
            ) latest_events
            GROUP BY address
            ON CONFLICT (address) DO UPDATE SET
              balances = EXCLUDED.balances,
              "denomUpdateBlockHeights" = EXCLUDED."denomUpdateBlockHeights",
              "blockHeight" = EXCLUDED."blockHeight",
              "blockTimeUnixMs" = EXCLUDED."blockTimeUnixMs",
              "blockTimestamp" = EXCLUDED."blockTimestamp",
              "updatedAt" = NOW()
            RETURNING address
          )
          SELECT address FROM inserted
          ORDER BY address
        `,
          { type: 'SELECT' }
        )) as unknown as { address: string }[]

        // Check if we processed any addresses in this batch
        if (!processedAddresses || processedAddresses.length === 0) {
          break // No more addresses to process
        }

        rangeProcessed += processedAddresses.length
        totalProcessed += processedAddresses.length

        range.lastProcessedAddress =
          processedAddresses[processedAddresses.length - 1].address
        saveRanges()

        const endTime = Date.now()
        const duration = (endTime - startTime) / 1000

        console.log(
          `[worker ${workerIndex + 1}] processed ${(
            (processedAddresses.length / rangeTotalAddresses) *
            100
          ).toFixed(
            4
          )}% (${processedAddresses.length.toLocaleString()}/${rangeTotalAddresses.toLocaleString()}) addresses (total ${duration.toLocaleString()} seconds)`
        )
      }

      const workerDuration = (Date.now() - workerStartTime) / 1000
      console.log(
        `[worker ${
          workerIndex + 1
        }] FINISHED processing ${rangeProcessed.toLocaleString()} addresses in ${workerDuration.toLocaleString()} seconds`
      )
    }

    const saveProgressInterval = setInterval(saveProgress, 30_000)

    // Start the workers.
    await Promise.all(ranges.map((range, index) => processRange(range, index)))

    clearInterval(saveProgressInterval)
    saveProgress()

    console.log(
      `\n[${new Date().toISOString()}] FINISHED processing all addresses`
    )

    if (deleteHistory) {
      console.log(
        `\n[${new Date().toISOString()}] deleting history except for ${addressesToKeepHistoryFor.length.toLocaleString()} addresses...`
      )
      const deleteStart = Date.now()

      // Delete events for addresses we don't need to keep history for.
      const deleted = await BankStateEvent.destroy({
        where: {
          address: {
            [Op.notIn]: addressesToKeepHistoryFor,
          },
        },
      })

      const deleteDuration = (Date.now() - deleteStart) / 1000
      console.log(
        `deleted ${deleted.toLocaleString()} rows in ${deleteDuration.toLocaleString()} seconds`
      )
    }
  }

  console.log(`\n[${new Date().toISOString()}] running vacuum...`)
  const vacuumStart = Date.now()
  await sequelize.query('VACUUM(FULL, ANALYZE, VERBOSE) "BankStateEvents"')
  await sequelize.query('VACUUM(ANALYZE, VERBOSE) "BankBalances"')
  console.log(
    `[${new Date().toISOString()}] vacuum completed in ${(
      (Date.now() - vacuumStart) /
      1000
    ).toLocaleString()} seconds`
  )

  const bankStateEventsSizeAfter = await getBankStateEventsSize()
  console.log(
    `BankStateEvents table size before migration: ${bankStateEventsSizeBefore}, after migration: ${bankStateEventsSizeAfter}`
  )

  const newHistoricalAccounts = await BankStateEvent.count({
    distinct: true,
    col: 'address',
  })

  console.log(
    `\n[${new Date().toISOString()}] FINISHED in ${(
      (Date.now() - allStartTime) /
      1000
    ).toLocaleString()} seconds`
  )
  console.log(
    `kept history for ${newHistoricalAccounts.toLocaleString()} addresses`
  )

  // Close DB connections.
  await sequelize.close()

  // Exit.
  process.exit(0)
}

main().catch((err) => {
  console.error('Bank migration worker errored', err)
  process.exit(1)
})
