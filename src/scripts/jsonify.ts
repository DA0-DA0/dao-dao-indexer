import { Command } from 'commander'
import { Op } from 'sequelize'

import { ParsedEvent, loadConfig } from '@/core'
import { Contract, Event, Transformation, loadDb } from '@/db'

const LOADER_MAP = ['—', '\\', '|', '/']

const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.option(
    '-b, --batch <path>',
    'batch size',
    (value) => parseInt(value, 10),
    50000
  )
  program.parse()
  const { config, batch } = program.opts()

  console.log(`\n[${new Date().toISOString()}] JSONifying existing events...`)

  // Load config with config option.
  loadConfig(config)

  // Load DB on start.
  const sequelize = await loadDb()

  let processed = 0
  let transformations = 0

  const eventFilter = {
    value: {
      [Op.and]: [
        {
          [Op.ne]: null,
          [Op.ne]: '',
          [Op.ne]: 'null',
        },
      ],
    },
    valueJson: null,
    delete: false,
  }

  let latestBlockHeight = -1
  const total = await Event.count({
    where: eventFilter,
  })

  // Print latest statistics every 100ms.
  let printLoaderCount = 0
  const logInterval = setInterval(() => {
    printLoaderCount = (printLoaderCount + 1) % LOADER_MAP.length
    process.stdout.write(
      `\r${
        LOADER_MAP[printLoaderCount]
      }  Event processed/total: ${processed.toLocaleString()}/${total.toLocaleString()}. Transformed: ${transformations.toLocaleString()}. Latest block height: ${latestBlockHeight?.toLocaleString()}`
    )
  }, 100)
  // Allow process to exit even though this interval is alive.
  logInterval.unref()

  let latestBlockEventIdsSeen: number[] = []
  while (processed < total) {
    const events = await Event.findAll({
      where: {
        ...eventFilter,
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

    // JSONify.
    await Promise.all(
      events.map(async (event) => {
        let valueJson = null
        try {
          valueJson = JSON.parse(event.value ?? 'null')
        } catch {
          // Ignore parsing errors.
        }
        if (valueJson !== null) {
          await event.update({ valueJson })
          event.valueJson = valueJson
        }
      })
    )

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
  }

  clearInterval(logInterval)

  console.log(`\n[${new Date().toISOString()}] JSONification complete.`)

  await sequelize.close()

  process.exit(0)
}

main()
