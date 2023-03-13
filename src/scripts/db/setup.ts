import * as readline from 'readline'

import { Command } from 'commander'

import { loadConfig } from '@/core/config'
import { DbType } from '@/core/types'
import { loadDb, setup as setupDb } from '@/db'

export const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.option('-f, --force', "don't ask for confirmation")
  program.parse()
  const { config: _config, force } = program.opts()

  // Load config with config option.
  loadConfig(_config)

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

  const setup = async () => {
    try {
      await setupDb(dataSequelize)
      await setupDb(accountsSequelize)

      console.log('\nDropped and recreated all tables.')
    } catch (err) {
      console.error(err)
    }
  }

  const close = async () => {
    await dataSequelize.close()
    await accountsSequelize.close()
    process.exit()
  }

  if (force) {
    await setup()
    await close()
  } else {
    rl.question(
      'Are you sure you want to recreate all tables? All existing data will be lost. [y/n] ',
      async (answer) => {
        if (answer === 'y') {
          await setup()
        } else {
          console.log('Aborted.')
        }

        await close()
      }
    )
  }
}

main()
