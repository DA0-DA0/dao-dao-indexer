import { Command } from 'commander'

import { loadConfig } from '@/core'
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
  const sequelize = await loadDb({ logging: true })

  try {
    // Alter the database to match any changes.
    await sequelize.sync({ alter: true })

    console.log('\nAltered.')
  } catch (err) {
    console.error(err)
  }

  await sequelize.close()
}

main()
