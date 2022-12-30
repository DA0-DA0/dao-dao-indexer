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
program.option(
  '-i, --initial <block height>',
  'initial block height',
  (value) => parseInt(value, 10),
  0
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

  let latestBlockHeight = options.initial
  const total = await Event.count({
    where: {
      blockHeight: {
        [Op.gte]: latestBlockHeight,
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

  let latestBlockEventIdsSeen: number[] = []
  while (processed < total) {
    const events = await Event.findAll({
      where: {
        // Since there can be multiple events per block, the fixed batch size
        // will likely end up leaving some events in the latest block out of
        // this batch. To fix this, repeat the latest block again (>=) excluding
        // the events we've already seen.
        blockHeight: {
          [Op.gte]: latestBlockHeight,
        },
        ...(latestBlockEventIdsSeen.length > 0 && {
          id: {
            [Op.notIn]: latestBlockEventIdsSeen,
          },
        }),
      },
      include: Contract,
      limit: options.batch,
      order: [['blockHeight', 'ASC']],
    })

    // If there are no more events, we're done.
    if (events.length === 0) {
      break
    }

    const newLatestBlockHeight = events[events.length - 1].blockHeight

    // If the latest block height is the same as the previous latest block
    // height, we are still in the same block and should append the event IDs to
    // the list instead of replacing it. This will only happen if the batch size
    // is smaller than the maximum number of events in any one block. Otherwise,
    // we're in a new block and should reset the list.
    if (newLatestBlockHeight === latestBlockHeight) {
      latestBlockEventIdsSeen = latestBlockEventIdsSeen.concat(
        events.map((event) => event.id)
      )
    } else {
      latestBlockEventIdsSeen = events
        .filter((event) => event.blockHeight === newLatestBlockHeight)
        .map((event) => event.id)
    }

    processed += events.length
    latestBlockHeight = events[events.length - 1].blockHeight

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
