import { Command } from 'commander'

import { loadConfig } from '@/core/config'
import { DbType } from '@/core/types'
import { loadDb } from '@/db'

export const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.parse()
  const options = program.opts()

  // Load config with config option.
  loadConfig(options.config)

  // Log when altering.
  const dataSequelize = await loadDb({
    type: DbType.Data,
    logging: true,
  })
  const accountsSequelize = await loadDb({
    type: DbType.Accounts,
    logging: true,
  })

  try {
    // Alter the database to match any changes.
    await dataSequelize.sync({ alter: true })
    await accountsSequelize.sync({ alter: true })

    console.log('\nAltered.')
  } catch (err) {
    console.error(err)
  }

  await dataSequelize.close()
  await accountsSequelize.close()
}

main()
