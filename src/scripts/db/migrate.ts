import { Command } from 'commander'

import { DbType, loadConfig } from '@/core'
import {
  Computation,
  ComputationDependency,
  PendingWebhook,
  StakingSlashEvent,
  State,
  Validator,
  WasmEvent,
  WasmEventTransformation,
  closeDb,
  loadDb,
} from '@/db'

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.requiredOption('-e, --exported <block>')
program.parse()
const { config: _config, exported } = program.opts()

// Load config with config option.
loadConfig(_config)

export const main = async () => {
  await loadDb({
    type: DbType.Data,
    logging: true,
  })

  // Create new stuff.
  await Validator.sync()
  await StakingSlashEvent.sync()
  await ComputationDependency.sync()
  await WasmEvent.sync()
  await WasmEventTransformation.sync()

  // Migrate State.
  await State.sync({ alter: true })
  await State.update(
    {
      lastWasmBlockHeightExported: exported,
    },
    {
      where: {
        singleton: true,
      },
    }
  )

  // Migrate existing stuff.
  await PendingWebhook.destroy({ where: {} })
  await PendingWebhook.sync({ alter: true })

  await Computation.destroy({ where: {} })
  await Computation.sync({ alter: true })

  // Give indexer permissions to new tables.
  await Validator.sequelize?.query(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES in SCHEMA public TO indexer;'
  )
  await Validator.sequelize?.query(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO indexer;'
  )

  // Migrate events to new table.
  await WasmEvent.sequelize?.query(
    'INSERT INTO "WasmEvents" ("contractAddress", "blockHeight", "blockTimeUnixMs", "blockTimestamp", "key", "value", "valueJson", "delete", "createdAt", "updatedAt") SELECT "contractAddress", "blockHeight", "blockTimeUnixMs", "blockTimestamp", "key", "value", "valueJson", "delete", "createdAt", "updatedAt" FROM "Events" ON CONFLICT DO NOTHING;'
  )
  // Migrate transformations to new table.
  await WasmEventTransformation.sequelize?.query(
    'INSERT INTO "WasmEventTransformations" ("contractAddress", "blockHeight", "blockTimeUnixMs", "name", "value", "createdAt", "updatedAt") SELECT "contractAddress", "blockHeight", "blockTimeUnixMs", "name", "value", "createdAt", "updatedAt" FROM "Transformations" ON CONFLICT DO NOTHING;'
  )

  // Close connection.
  await closeDb()
}

main()
