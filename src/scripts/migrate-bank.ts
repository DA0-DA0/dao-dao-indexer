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
program.option('-b, --batch-size <size>', 'batch size', '100')
program.option('-d, --delete-history', 'delete history')
program.parse()
const { config: _config, batchSize: _batchSize, deleteHistory } = program.opts()

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
  const historyCodeIds = WasmCodeService.getInstance().findWasmCodeIdsByKeys(
    ...BANK_HISTORY_CODE_IDS_KEYS
  )
  const addressesToKeepHistoryFor = historyCodeIds.length
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

  const totalAddresses = Number(
    (
      (await sequelize.query(
        'SELECT COUNT(*) FROM (SELECT DISTINCT address FROM "BankStateEvents") AS temp;'
      )) as unknown as [[{ count: string }]]
    )[0][0].count
  )
  console.log(`found ${totalAddresses.toLocaleString()} addresses to migrate\n`)

  // Process in batches
  const batchSize = Number(_batchSize)
  let offset = 0
  let processedCount = 0

  const saveProgress = () =>
    console.log(
      `processed ${((processedCount / totalAddresses) * 100).toFixed(
        4
      )}% (${processedCount.toLocaleString()}/${totalAddresses.toLocaleString()}) addresses`
    )
  saveProgress()

  while (processedCount < totalAddresses) {
    const startTime = Date.now()

    // Process a batch of addresses using a CTE (Common Table Expression)
    const [processedAddresses] = (await sequelize.query(`
      WITH addresses_batch AS (
        SELECT DISTINCT address
        FROM "BankStateEvents"
        ORDER BY address
        LIMIT ${batchSize} OFFSET ${offset}
      )
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
    `)) as unknown as [{ address: string }[]]

    // Check if we processed any addresses in this batch
    if (!processedAddresses || processedAddresses.length === 0) {
      break // No more addresses to process
    }

    // Delete events for addresses we don't need to keep history for
    const deletedEvents = deleteHistory
      ? await BankStateEvent.destroy({
          where: {
            address: {
              [Op.in]: processedAddresses.map((row) => row.address),

              ...(addressesToKeepHistoryFor.length > 0 && {
                [Op.notIn]: addressesToKeepHistoryFor,
              }),
            },
          },
        })
      : 0

    processedCount += processedAddresses.length
    offset += batchSize

    const endTime = Date.now()
    const duration = (endTime - startTime) / 1000

    console.log(
      `processed ${processedAddresses.length.toLocaleString()} addresses and deleted ${deletedEvents.toLocaleString()} historical events in ${duration.toLocaleString()} seconds`
    )

    saveProgress()
  }

  saveProgress()

  const newHistoricalAccounts = Number(
    (
      (await sequelize.query(
        'SELECT COUNT(*) FROM (SELECT DISTINCT address FROM "BankStateEvents") AS temp;'
      )) as unknown as [[{ count: string }]]
    )[0][0].count
  )

  console.log(
    `\nkept history for ${newHistoricalAccounts.toLocaleString()} addresses`
  )

  console.log(
    `[${new Date().toISOString()}] FINISHED in ${(
      (Date.now() - allStartTime) /
      1000
    ).toLocaleString()} seconds`
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
