import { Command } from 'commander'

import { loadConfig } from '../config'
import { loadDb } from '../db'
import { setupMeilisearch } from './setup'
import { updateIndexesForContracts } from './update'

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.parse()
const options = program.opts()

const main = async () => {
  // Load config with config option.
  await loadConfig(options.config)

  // Connect to db.
  const sequelize = await loadDb()

  try {
    // Setup meilisearch.
    await setupMeilisearch()

    // Update.
    const updated = await updateIndexesForContracts()

    console.log(`Updated ${updated} documents.`)
  } catch (err) {
    throw err
  } finally {
    await sequelize.close()
  }
}

main()
