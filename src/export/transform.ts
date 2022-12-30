import { Command } from 'commander'
import { Op } from 'sequelize'

import { loadConfig } from '../core/config'
import { ParsedEvent } from '../core/types'
import { Contract, Event, Transformation, loadDb } from '../db'

const LOADER_MAP = ['—', '\\', '|', '/']

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.option('-o, --offset <number>', 'initial offset', (value) =>
  parseInt(value, 10)
)
program.option(
  '-b, --batch <path>',
  'batch size',
  (value) => parseInt(value, 10),
  1000
)
program.parse()
const options = program.opts()

const main = async () => {
  console.log(`\n[${new Date().toISOString()}] Transforming existing events...`)

  // Load config with config option.
  loadConfig(options.config)

  // Load DB on start.
  await loadDb()

  let processed = 0
  let transformations = 0

  let lastId = options.offset
    ? (
        await Event.findOne({
          offset: options.offset - 1,
          order: [['id', 'ASC']],
        })
      )?.id ?? 0
    : 0
  const total = await Event.count({
    where: {
      id: {
        [Op.gt]: lastId,
      },
    },
  })

  // Print latest statistics every 100ms.
  let printLoaderCount = 0
  const logInterval = setInterval(() => {
    printLoaderCount = (printLoaderCount + 1) % LOADER_MAP.length
    process.stdout.write(
      `\r${
        LOADER_MAP[printLoaderCount]
      }  Transformed: ${transformations.toLocaleString()}. Event processed/total: ${processed.toLocaleString()}/${total.toLocaleString()}.`
    )
  }, 100)
  // Allow process to exit even though this interval is alive.
  logInterval.unref()

  while (processed < total) {
    const events = await Event.findAll({
      where: {
        id: {
          [Op.gt]: lastId,
        },
      },
      include: Contract,
      limit: options.batch,
      order: [['id', 'ASC']],
    })

    processed += events.length
    lastId = events[events.length - 1].id

    const parsedEvents = events.map(
      (event): ParsedEvent => ({
        codeId: event.contract.codeId,
        contractAddress: event.contractAddress,
        blockHeight: event.blockHeight,
        blockTimeUnixMs: event.blockTimeUnixMs,
        blockTimestamp: event.blockTimestamp,
        key: event.key,
        value: event.value,
        valueJson: event.valueJson,
        delete: event.delete,
      })
    )

    transformations += (await Transformation.transformEvents(parsedEvents))
      .length
  }

  clearInterval(logInterval)

  console.log(`\n[${new Date().toISOString()}] Transforming complete.`)
}

main()
