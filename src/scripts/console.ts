import repl from 'repl'
import { Context } from 'vm'

import { Command } from 'commander'
import { Op, Sequelize, fn } from 'sequelize'

import * as Config from '@/config'
import { loadConfig } from '@/config'
import { loadDb } from '@/db'
import * as Models from '@/db/models'
import { queues } from '@/queues'
import * as Services from '@/services'
import { DbType } from '@/types'
import * as Utils from '@/utils'

// Global context available to repl.
const context: Context = {
  Op,
  Sequelize,
  fn,
}

const setupImport = (imported: Record<string, unknown>) =>
  Object.entries(imported).forEach(([name, importedModule]) => {
    context[name] = importedModule
  })

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.option('-l, --logging', 'enable db query logging', false)
program.parse()
const { config, logging } = program.opts()

// Load config with config option.
loadConfig(config)

const main = async () => {
  // Setup both DBs.
  await loadDb({
    type: DbType.Data,
    logging,
  })
  await loadDb({
    type: DbType.Accounts,
    logging,
  })

  // ADD TO CONTEXT
  setupImport({
    ...Utils,
    ...Config,
    ...Models,
    ...Services,
    ...Object.fromEntries(queues.map((queue) => [queue.name, queue])),
  })

  // START REPL
  const r = repl.start('> ')
  Object.assign(r.context, context)

  r.on('exit', () => {
    console.log('Exiting...')
    // tell node script to exit once repl exits
    process.exit()
  })
}

main()
