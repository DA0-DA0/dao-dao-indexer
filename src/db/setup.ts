import * as readline from 'readline'

import { Command } from 'commander'

import { loadConfig } from '@/core'

import { loadDb } from './connection'

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

  const sequelize = await loadDb()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  rl.question(
    'Are you sure you want to recreate all tables? All existing data will be lost. [y/n] ',
    async (answer) => {
      if (answer === 'y') {
        try {
          // Add trigram index extension.
          await sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;')
          await sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gin;')

          // Drop all tables and recreate them.
          await sequelize.sync({ force: true })

          console.log('\nDropped and recreated all tables.')
        } catch (err) {
          console.error(err)
        }
      } else {
        console.log('Aborted.')
      }

      await sequelize.close()
      process.exit()
    }
  )
}

main()
