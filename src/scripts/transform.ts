import { Command } from 'commander'
import { Op } from 'sequelize'

import { ParsedEvent, loadConfig } from '@/core'
import {
  Contract,
  Event,
  Transformation,
  loadDb,
  updateComputationValidityDependentOnChanges,
} from '@/db'

const LOADER_MAP = ['—', '\\', '|', '/']

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
    '-b, --batch <path>',
    'batch size',
    (value) => parseInt(value, 10),
    50000
  )
  program.option(
    '-a, --addresses <addresses>',
    'comma separated list of contract addresses to transform',
    (value) => value.split(',')
  )
  program.parse()
  const { config, initial, batch, addresses } = program.opts()

  console.log(`\n[${new Date().toISOString()}] Transforming existing events...`)

  // Load config with config option.
  loadConfig(config)

  // Load DB on start.
  const sequelize = await loadDb()

  let processed = 0
  let computationsUpdated = 0
  let computationsDestroyed = 0
  let transformations = 0

  const addressFilter = addresses?.length
    ? {
        contractAddress: addresses,
      }
    : {}

  let latestBlockHeight = initial
  const total = await Event.count({
    where: {
      ...addressFilter,
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
      }  Transformed: ${transformations.toLocaleString()}. Event processed/total: ${processed.toLocaleString()}/${total.toLocaleString()}. Computations updated/destroyed: ${computationsUpdated.toLocaleString()}/${computationsDestroyed.toLocaleString()}. Latest block height: ${latestBlockHeight.toLocaleString()}`
    )
  }, 100)
  // Allow process to exit even though this interval is alive.
  logInterval.unref()

  let latestBlockEventIdsSeen: number[] = []
  while (processed < total) {
    const events = await Event.findAll({
      where: {
        ...addressFilter,
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
      limit: batch,
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
    latestBlockHeight = newLatestBlockHeight

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

    const _transformations = await Transformation.transformEvents(parsedEvents)

    transformations += _transformations.length

    const { updated, destroyed } =
      await updateComputationValidityDependentOnChanges([], _transformations)

    computationsUpdated += updated
    computationsDestroyed += destroyed
  }

  clearInterval(logInterval)

  console.log(`\n[${new Date().toISOString()}] Transforming complete.`)

  await sequelize.close()

  process.exit(0)
}

main()
