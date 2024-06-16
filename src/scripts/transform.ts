import { Command } from 'commander'

import { loadConfig } from '@/core'
import { loadDb } from '@/db'
import { TransformationsQueue } from '@/queues/transform'
import { WasmCodeService } from '@/services/wasm-codes'

const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.option(
    '-i, --initial <block height>',
    'initial block height',
    (value) => parseInt(value, 10),
    0
  )
  program.option(
    '-b, --batch <size>',
    'batch size',
    (value) => parseInt(value, 10),
    50000
  )
  program.option(
    '-a, --addresses <addresses>',
    'comma separated list of contract addresses to transform',
    (value) => value.split(',')
  )
  program.option(
    '-k, --code-ids-keys <keys>',
    'comma separated list of code IDs keys from the config to transform'
  )
  program.option(
    // Adds inverted `update` boolean to the options object.
    '--no-update',
    "don't update computation validity based on new events or transformations"
  )
  program.parse()
  const {
    config: _config,
    initial,
    batch,
    addresses,
    update,
    codeIdsKeys,
  } = program.opts()

  // Load config with config option.
  const config = loadConfig(_config)

  // Load DB on start.
  const sequelize = await loadDb()

  // Set up wasm code service.
  await WasmCodeService.setUpInstance()

  // Use queue process function directly.
  await new TransformationsQueue({
    config,
    updateComputations: !!update,
    sendWebhooks: false,
  }).process({
    data: {
      minBlockHeight: initial,
      batchSize: batch,
      addresses,
      codeIdsKeys: WasmCodeService.extractWasmCodeKeys(codeIdsKeys),
    },
  } as any)

  await sequelize.close()

  process.exit(0)
}

main()
