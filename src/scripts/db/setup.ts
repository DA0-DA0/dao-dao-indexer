import * as readline from 'readline'

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

  const dataSequelize = await loadDb({
    type: DbType.Data,
  })
  const accountsSequelize = await loadDb({
    type: DbType.Accounts,
  })

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
          await dataSequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;')
          await dataSequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gin;')

          // Drop all tables and recreate them.
          await dataSequelize.sync({ force: true })
          await accountsSequelize.sync({ force: true })

          console.log('\nDropped and recreated all tables.')
        } catch (err) {
          console.error(err)
        }
      } else {
        console.log('Aborted.')
      }

      await dataSequelize.close()
      await accountsSequelize.close()
      process.exit()
    }
  )
}

main()
