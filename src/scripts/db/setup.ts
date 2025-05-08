import * as fs from 'fs'
import path from 'path'
import * as readline from 'readline'

import { Command } from 'commander'

import { ConfigManager } from '@/config'
import { loadDb, setup as setupDb } from '@/db'
import { DbType } from '@/types'

export const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.option('-f, --force', "don't ask for confirmation")
  program.option('-d, --destroy', 'destroy tables if they already exist')
  program.parse()
  const { config: _config, force, destroy = false } = program.opts()

  // Load config from specific config file.
  ConfigManager.load(_config)

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
      await setupDb(dataSequelize, destroy, 'data')
      // Do not destroy accounts tables.
      await setupDb(accountsSequelize, false, 'accounts')

      // Add migrations to data database.
      const migrations = fs.readdirSync(
        path.join(process.cwd(), './dist/db/migrations')
      )
      for (const migration of migrations) {
        await dataSequelize.query(
          `INSERT INTO "SequelizeMeta" ("name") VALUES ('${migration}') ON CONFLICT ("name") DO NOTHING;`
        )
      }

      console.log(
        `\n${destroy ? 'Dropped and recreated' : 'Synced'} all tables.`
      )
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
      `Are you sure you want to ${destroy ? 'recreate' : 'sync'} all tables?${
        destroy ? ' All existing data will be lost.' : ''
      } [y/n] `,
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
