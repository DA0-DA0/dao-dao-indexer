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
program.option('-p, --parallel <count>', 'max number of parallel workers', '5')
program.option('--no-delete-history', "don't delete history")
program.parse()
const { config: _config, batch, deleteHistory, parallel } = program.opts()

// Load config with config option.
ConfigManager.load(_config)

/**
 * A range of addresses to process.
 */
type Range = {
  startAfterAddress: string
  /**
   * Initialized to the startAfterAddress and updated as we process addresses.
   * Saves the progress of the worker.
   */
  lastProcessedAddress: string
  endAddress: string
}

/**
 * The progress of a range.
 */
type RangeProgress = {
  /**
   * The range being processed.
   */
  range: Range
  /**
   * The number of addresses processed.
   */
  processed: number
  /**
   * The total number of addresses to process.
   */
  total: number
  /**
   * The start timestamp of the worker, if started.
   */
  startedAt?: number
  /**
   * The last update timestamp of the worker.
   */
  lastUpdatedAt?: number
  /**
   * The end timestamp of the worker, if finished.
   */
  endedAt?: number
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
      const parallelWorkersMinusOne = parallelWorkers - 1
      const [addressBoundariesResult] = (await sequelize.query(
        `
        WITH address_counts AS (
          SELECT
            address,
            COUNT(*) as row_count
          FROM "BankStateEvents"
          GROUP BY address
        ),
        total AS (
          SELECT SUM(row_count) AS total_rows FROM address_counts
        ),
        address_with_running_total AS (
          SELECT 
            address,
            row_count,
            SUM(row_count) OVER (ORDER BY address) as running_total
          FROM address_counts
        ),
        partition_points AS (
          SELECT
            gs.series_val,
            (SELECT total_rows FROM total) * gs.series_val::float / ${parallelWorkers} as threshold
          FROM 
            (SELECT generate_series(1, ${parallelWorkersMinusOne}, 1) as series_val) gs
        )
        SELECT DISTINCT ON (pp.series_val) awt.address
        FROM partition_points pp
        JOIN address_with_running_total awt ON 
          awt.running_total > pp.threshold AND 
          awt.running_total - awt.row_count <= pp.threshold
        ORDER BY pp.series_val, awt.running_total ASC;
        `,
        { type: 'SELECT' }
      )) as unknown as [{ address: string }[]]

      // Remove duplicates but keep original order.
      const uniqueAddressBoundaries: string[] = []
      for (const { address } of addressBoundariesResult) {
        if (!uniqueAddressBoundaries.includes(address)) {
          uniqueAddressBoundaries.push(address)
        }
      }

      // Build the ranges using the boundaries
      let startAfterAddress = ''

      // Add boundaries as end addresses for each range except the last
      for (const endAddress of uniqueAddressBoundaries) {
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

    // Initialize progress display
    const progressDisplay = new ProgressDisplay()
    const rangeProgress = ranges.map(
      (range): RangeProgress => ({
        range,
        processed: 0,
        total: 0,
      })
    )

    const updateProgress = () => progressDisplay.update(rangeProgress)

    const processRange = async (range: Range, rangeIndex: number) => {
      const progress = rangeProgress[rangeIndex]
      while (range.lastProcessedAddress !== range.endAddress) {
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

        progress.processed += processedAddresses.length
        progress.lastUpdatedAt = Date.now()
        updateProgress()

        range.lastProcessedAddress =
          processedAddresses[processedAddresses.length - 1].address
        saveRanges()
      }

      progress.endedAt = Date.now()
      progress.lastUpdatedAt = Date.now()
      updateProgress()
    }

    // Initialize progress.
    await Promise.all(
      ranges.map(async (range, index) => {
        const progress = rangeProgress[index]

        console.log(
          `[worker ${index + 1}] processing range from '${
            range.startAfterAddress
          }' to '${range.endAddress}'...`
        )

        progress.total = await BankStateEvent.count({
          where: {
            address: {
              [Op.gt]: range.lastProcessedAddress,
              [Op.lte]: range.endAddress,
            },
          },
          distinct: true,
          col: 'address',
        })
        progress.startedAt = Date.now()
        progress.lastUpdatedAt = Date.now()
      })
    )

    // Process the ranges.
    await Promise.all(ranges.map((range, index) => processRange(range, index)))

    updateProgress()

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

/**
 * Simple progress manager to handle stats display with terminal control
 */
class ProgressDisplay {
  private displayed = false
  private lastLineCount = 0

  /**
   * Updates the progress display with current range information
   */
  update(progress: RangeProgress[]) {
    // Clear previous output if any
    if (this.displayed) {
      this.clearLines(this.lastLineCount)
    }

    const output = this.formatProgress(progress)
    this.lastLineCount = output.split('\n').length

    // Add new line if not yet displayed.
    if (!this.displayed) {
      console.log()
      this.displayed = true
    }

    // Write the formatted output
    process.stdout.write(output)
  }

  /**
   * Clears the specified number of lines from terminal. 1 line is the current
   * line. 2 lines is the current line and the previous line. etc.
   */
  private clearLines(count: number) {
    if (count === 0) {
      return
    }
    process.stdout.write(`\x1b[${count - 1}A\r`) // Move cursor up and to the beginning of the line.
    process.stdout.write('\x1b[J') // Clear to end of screen.
  }

  /**
   * Formats range progress information
   */
  private formatProgress(progress: RangeProgress[]): string {
    // Calculate total progress
    const { processed, total, earliestStart } = progress.reduce(
      (acc, p) => ({
        processed: acc.processed + p.processed,
        total: acc.total + p.total,
        earliestStart: p.startedAt
          ? Math.min(acc.earliestStart || p.startedAt, p.startedAt)
          : acc.earliestStart,
      }),
      { processed: 0, total: 0, earliestStart: 0 } as {
        processed: number
        total: number
        earliestStart: number
      }
    )

    // Format range status lines
    const rangeLines = progress.map((progress, index) => {
      const prefix = `Worker ${index + 1}:`.padEnd(11)

      if (!progress.startedAt) {
        return (
          prefix +
          `Counting addresses between '${progress.range.startAfterAddress}' and '${progress.range.endAddress}'...`
        )
      }

      const duration =
        ((progress.endedAt || progress.lastUpdatedAt || Date.now()) -
          progress.startedAt) /
        1000
      const avgSpeedMs = progress.processed
        ? (duration / progress.processed) * 1000
        : undefined

      if (progress.endedAt) {
        return (
          prefix +
          `Finished ${progress.processed.toLocaleString()} addresses in ${duration.toLocaleString(
            undefined,
            {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }
          )}s (avg ${
            avgSpeedMs?.toLocaleString(undefined, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }) || '-'
          }ms/address)`
        )
      }

      const percent = ((progress.processed / progress.total) * 100).toFixed(2)
      const etaMins =
        avgSpeedMs !== undefined
          ? ((progress.total - progress.processed) * avgSpeedMs) / 1000 / 60
          : undefined

      return (
        prefix +
        `${percent}% (${progress.processed.toLocaleString()}/${progress.total.toLocaleString()}) in ${duration.toLocaleString(
          undefined,
          {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }
        )}s (avg ${
          avgSpeedMs?.toLocaleString(undefined, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }) || '-'
        }ms/address) (eta in ${
          etaMins?.toLocaleString(undefined, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }) || '-'
        }mins @ ${
          etaMins
            ? new Date(Date.now() + etaMins * 60 * 1000).toLocaleString(
                undefined,
                {
                  timeZoneName: 'short',
                  second: undefined,
                }
              )
            : '-'
        })`
      )
    })

    // Format total status line
    let totalLine = 'Total:'.padEnd(11)
    if (progress.some((p) => !p.startedAt)) {
      totalLine += 'Waiting for workers to count addresses...'
    } else if (progress.some((p) => !p.endedAt)) {
      const percent = ((processed / total) * 100).toFixed(2)
      const duration = (Date.now() - earliestStart) / 1000
      const avgSpeedMs = processed ? (duration / processed) * 1000 : undefined
      const etaMins =
        avgSpeedMs !== undefined
          ? ((total - processed) * avgSpeedMs) / 1000 / 60
          : undefined
      totalLine += `${percent}% (${processed.toLocaleString()}/${total.toLocaleString()}) in ${duration.toLocaleString(
        undefined,
        {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }
      )}s (avg ${
        avgSpeedMs?.toLocaleString(undefined, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) || '-'
      }ms/address) (eta in ${
        etaMins?.toLocaleString(undefined, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) || '-'
      }mins @ ${
        etaMins
          ? new Date(Date.now() + etaMins * 60 * 1000).toLocaleString(
              undefined,
              {
                timeZoneName: 'short',
                second: undefined,
              }
            )
          : '-'
      })`
    } else {
      const duration = ((Date.now() - earliestStart) / 1000).toLocaleString(
        undefined,
        {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }
      )
      totalLine += `Completed ${processed.toLocaleString()} addresses in ${duration}s`
    }

    const lines = [...rangeLines, '', totalLine]
    const longestLineLength = Math.max(...lines.map((line) => line.length))

    // Create a progress bar as long as the longest line.
    if (!progress.some((p) => !p.startedAt)) {
      const filledWidth = Math.floor((longestLineLength * processed) / total)
      const emptyWidth = longestLineLength - filledWidth
      lines.push(`${'█'.repeat(filledWidth)}${'░'.repeat(emptyWidth)}`)
    }

    // Format the progress box
    return `${'—'.repeat(longestLineLength + 6)}
|${' '.repeat(longestLineLength + 4)}|
${lines
  .map(
    (line) => `|  ${line}${' '.repeat(longestLineLength - line.length + 2)}|`
  )
  .join('\n')}
|${' '.repeat(longestLineLength + 4)}|
${'—'.repeat(longestLineLength + 6)}
`
  }
}
