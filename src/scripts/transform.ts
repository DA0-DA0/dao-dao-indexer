import { Command } from 'commander'
import { Op } from 'sequelize'

import { loadConfig } from '@/core'
import {
  Contract,
  WasmStateEvent,
  WasmStateEventTransformation,
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

  console.log(`\n[${new Date().toISOString()}] Transforming existing events...`)

  // Load config with config option.
  const config = loadConfig(_config)

  // Load DB on start.
  const sequelize = await loadDb()

  let processed = 0
  let computationsUpdated = 0
  let computationsDestroyed = 0
  let transformed = 0

  const addressFilter = addresses?.length
    ? {
        contractAddress: addresses,
      }
    : {}

  const codeIds = (
    codeIdsKeys && typeof codeIdsKeys === 'string' ? codeIdsKeys.split(',') : []
  ).flatMap((key) => config.codeIds?.[key] ?? [])
  const includeContract = {
    include: {
      model: Contract,
      required: true,
      where:
        codeIds.length > 0
          ? {
              codeId: {
                [Op.in]: codeIds,
              },
            }
          : undefined,
    },
  }

  let latestBlockHeight = initial
  const total = await WasmStateEvent.count({
    where: {
      ...addressFilter,
      blockHeight: {
        [Op.gte]: latestBlockHeight,
      },
    },
    ...includeContract,
  })

  // Print latest statistics every 100ms.
  let printLoaderCount = 0
  const printStatistics = () => {
    printLoaderCount = (printLoaderCount + 1) % LOADER_MAP.length
    process.stdout.write(
      `\r${
        LOADER_MAP[printLoaderCount]
      }  Transformed: ${transformed.toLocaleString()}. Event processed/total: ${processed.toLocaleString()}/${total.toLocaleString()}. Computations updated/destroyed: ${computationsUpdated.toLocaleString()}/${computationsDestroyed.toLocaleString()}. Latest block height: ${latestBlockHeight.toLocaleString()}`
    )
  }
  const logInterval = setInterval(printStatistics, 100)
  // Allow process to exit even though this interval is alive.
  logInterval.unref()

  let latestBlockEventIdsSeen: number[] = []
  while (processed < total) {
    const events = await WasmStateEvent.findAll({
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
      limit: batch,
      order: [['blockHeight', 'ASC']],
      ...includeContract,
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
    if (Number(newLatestBlockHeight) === latestBlockHeight) {
      latestBlockEventIdsSeen = latestBlockEventIdsSeen.concat(
        events.map((event) => event.id)
      )
    } else {
      latestBlockEventIdsSeen = events
        .filter((event) => event.blockHeight === newLatestBlockHeight)
        .map((event) => event.id)
    }

    processed += events.length
    latestBlockHeight = Number(newLatestBlockHeight)

    const transformations =
      await WasmStateEventTransformation.transformParsedStateEvents(
        events.map((event) => event.asParsedEvent)
      )

    transformed += transformations.length

    const { updated, destroyed } = update
      ? await updateComputationValidityDependentOnChanges(transformations)
      : {
          updated: 0,
          destroyed: 0,
        }

    computationsUpdated += updated
    computationsDestroyed += destroyed
  }

  clearInterval(logInterval)

  printStatistics()
  console.log(`\n[${new Date().toISOString()}] Transforming complete.`)

  await sequelize.close()

  process.exit(0)
}

main()
