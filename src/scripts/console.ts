import repl from 'repl'
import { Context } from 'vm'

import { Command } from 'commander'

import { loadConfig } from '@/core'
import { loadDb } from '@/db'
import * as Models from '@/db/models'

const context: Context = {}

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
  // Setup db.
  await loadDb({ logging })

  // ADD TO CONTEXT
  setupImport(Models)

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
