import { Command } from 'commander'

import { loadConfig } from '@/core/config'
import { loadDb } from '@/db'
import { setupMeilisearch, updateIndexes } from '@/ms'
import { WasmCodeService } from '@/services/wasm-codes'

const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.option(
    '-i, --index <index>',
    'only update the specified index, falling back to all indexes'
  )
  program.parse()
  const options = program.opts()

  // Load config with config option.
  loadConfig(options.config)

  // Connect to db.
  const sequelize = await loadDb()

  // Set up wasm code service.
  await WasmCodeService.setUpInstance()

  try {
    // Setup meilisearch.
    await setupMeilisearch()

    // Update.
    const updated = await updateIndexes({
      index: options.index,
    })

    console.log(`Updated ${updated} documents.`)
  } catch (err) {
    throw err
  } finally {
    await sequelize.close()
  }
}

main()
