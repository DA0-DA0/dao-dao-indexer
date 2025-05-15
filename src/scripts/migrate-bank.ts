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
program.option('-b, --batch <size>', 'batch size', '1000')
program.option('--no-delete-history', "don't delete history")
program.parse()
const { config: _config, batch, deleteHistory } = program.opts()

// Load config with config option.
ConfigManager.load(_config)

const main = async () => {
  // Load DB on start.
  const sequelize = await loadDb({
    type: DbType.Data,
  })

  // Set up wasm code service.
  await WasmCodeService.setUpInstance()

  const allStartTime = Date.now()
  console.log(`\n[${new Date().toISOString()}] STARTING...\n`)

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
        `SELECT pg_size_pretty(pg_total_relation_size('"BankStateEvents"'))`
      )) as unknown as [[{ pg_size_pretty: string }]]
    )[0][0].pg_size_pretty

  const bankStateEventsSizeBefore = await getBankStateEventsSize()

  const totalAddresses = Number(
    (
      (await sequelize.query(
        'SELECT COUNT(*) FROM (SELECT DISTINCT address FROM "BankStateEvents") AS temp;'
      )) as unknown as [[{ count: string }]]
    )[0][0].count
  )
  console.log(
    `found ${totalAddresses.toLocaleString()} addresses to migrate in BankStateEvents table, size: ${bankStateEventsSizeBefore}\n`
  )

  if (totalAddresses > 0) {
    // Process in batches
    const batchSize = Number(batch)
    let processedCount = 0
    let lastProcessedAddress = ''
    const migrationStartTime = Date.now()

    const saveProgress = () =>
      console.log(
        `processed ${((processedCount / totalAddresses) * 100).toFixed(
          4
        )}% (${processedCount.toLocaleString()}/${totalAddresses.toLocaleString()}) addresses (total ${(
          (Date.now() - migrationStartTime) /
          1000
        ).toLocaleString()} seconds)`
      )
    saveProgress()

    while (processedCount < totalAddresses) {
      const startTime = Date.now()

      // Process a batch of addresses using a CTE (Common Table Expression)
      const [processedAddresses] = (await sequelize.query(`
      WITH addresses_batch AS (
        SELECT DISTINCT address
        FROM "BankStateEvents"
        WHERE address > '${lastProcessedAddress}'
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
      ORDER BY address;
    `)) as unknown as [{ address: string }[]]

      // Check if we processed any addresses in this batch
      if (!processedAddresses || processedAddresses.length === 0) {
        break // No more addresses to process
      }

      processedCount += processedAddresses.length
      lastProcessedAddress =
        processedAddresses[processedAddresses.length - 1].address

      const endTime = Date.now()
      const duration = (endTime - startTime) / 1000

      console.log(
        `processed ${processedAddresses.length.toLocaleString()} addresses in ${duration.toLocaleString()} seconds`
      )

      saveProgress()
    }

    saveProgress()

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

  console.log(
    `\n[${new Date().toISOString()}] running VACUUM(FULL, ANALYZE, VERBOSE)...`
  )
  const vacuumStart = Date.now()

  await sequelize.query(
    'VACUUM(FULL, ANALYZE, VERBOSE) "BankStateEvents", "BankBalances"'
  )
  console.log(
    `[${new Date().toISOString()}] VACUUM completed in ${(
      (Date.now() - vacuumStart) /
      1000
    ).toLocaleString()} seconds`
  )

  const bankStateEventsSizeAfter = await getBankStateEventsSize()
  console.log(
    `BankStateEvents table size after migration: ${bankStateEventsSizeAfter}`
  )

  const newHistoricalAccounts = Number(
    (
      (await sequelize.query(
        'SELECT COUNT(*) FROM (SELECT DISTINCT address FROM "BankStateEvents") AS temp;'
      )) as unknown as [[{ count: string }]]
    )[0][0].count
  )

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
