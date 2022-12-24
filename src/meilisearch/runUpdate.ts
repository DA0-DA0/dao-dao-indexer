import { Command } from 'commander'

import { loadConfig } from '../config'
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

  // Setup meilisearch.
  await setupMeilisearch()

  // Update.
  const updated = await updateIndexesForContracts()

  console.log(`Updated ${updated} documents.`)
}

main()
