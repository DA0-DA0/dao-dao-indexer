import * as fs from 'fs'
import readline from 'readline'

import * as Sentry from '@sentry/node'
import axios from 'axios'
import { Command } from 'commander'
import { Sequelize } from 'sequelize'

import {
  IndexerEvent,
  ParsedEvent,
  loadConfig,
  objectMatchesStructure,
} from '@/core'
import {
  Contract,
  Event,
  PendingWebhook,
  State,
  Transformation,
  loadDb,
  updateComputationValidityDependentOnChanges,
} from '@/db'
import { setupMeilisearch, updateIndexesForContracts } from '@/ms'

const LOADER_MAP = ['—', '\\', '|', '/']

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.option(
  '-i, --initial <block height>',
  'block height to start exporting from, falling back to after the last exported block',
  (value) => BigInt(value)
)
program.option(
  '-b, --batch <size>',
  'batch size',
  (value) => parseInt(value, 10),
  1000
)
program.option(
  // Adds inverted `update` boolean to the options object.
  '--no-update',
  "don't update computation validity based on new events or transformations"
)
program.option(
  // Adds inverted `webhooks` boolean to the options object.
  '--no-webhooks',
  "don't send webhooks"
)
program.parse()
const options = program.opts()

// Load config with config option.
const config = loadConfig(options.config)

// Add Sentry error reporting.
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
  })
}

// Read state.
let reading = false
let printLoaderCount = 0
// When true, shut down ASAP.
let shuttingDown = false

let latestBlockHeightExported = 0n
const exit = () => {
  console.log(
    `\n[${new Date().toISOString()}] Latest exported block with event: ${latestBlockHeightExported.toLocaleString()}. Exiting...`
  )

  process.exit(0)
}

const main = async () => {
  console.log(`\n\n[${new Date().toISOString()}] Exporting events...`)

  // Ensure events file exists.
  if (!config.eventsFile || !fs.existsSync(config.eventsFile)) {
    throw new Error(`Events file not found (${config.eventsFile}).`)
  }

  // Load DB on start.
  await loadDb()
  // Setup meilisearch.
  await setupMeilisearch()

  // Initialize state.
  await State.createSingletonIfMissing()
  // Update state with latest from RPC.
  const initialState = await updateState()

  const initialBlock =
    (options.initial as bigint | undefined) ??
    // Start at the next block after the last exported block if no command line
    // argument passed for `block`.
    (initialState.lastBlockHeightExported ?? 0n) + 1n

  // Return promise that never resolves. Listen for file changes.
  return new Promise((_, reject) => {
    let latestBlockHeight = initialState.latestBlockHeight
    // Update db state every 3 seconds.
    const stateInterval = setInterval(async () => {
      latestBlockHeight = (await updateState()).latestBlockHeight
    }, 3000)
    // Allow process to exit even though this interval is alive.
    stateInterval.unref()

    // Read state.
    let pendingRead = false
    let bytesRead = 0

    // Pending events and statistics.
    const pendingIndexerEvents: IndexerEvent[] = []
    let processed = 0
    let exported = 0
    let computationsUpdated = 0
    let computationsDestroyed = 0
    let transformations = 0
    let webhooksQueued = 0
    let catchingUp = true
    let linesRead = 0

    const printStatistics = () => {
      printLoaderCount = (printLoaderCount + 1) % LOADER_MAP.length
      process.stdout.write(
        `\r${LOADER_MAP[printLoaderCount]}  ${
          catchingUp
            ? `Catching up... ${linesRead.toLocaleString()} lines read.`
            : `Processed/exported: ${processed.toLocaleString()}/${exported.toLocaleString()}. Latest block exported: ${latestBlockHeightExported.toLocaleString()}. Latest block: ${latestBlockHeight.toLocaleString()}. Computations updated/destroyed: ${computationsUpdated.toLocaleString()}/${computationsDestroyed.toLocaleString()}. Transformed: ${transformations.toLocaleString()}. Webhooks queued: ${webhooksQueued.toLocaleString()}.`
        }`
      )
    }

    // Print latest statistics every 100ms.
    const logInterval = setInterval(printStatistics, 100)
    // Allow process to exit even though this interval is alive.
    logInterval.unref()

    const printStatisticsAndExit = () => {
      printStatistics()
      clearInterval(logInterval)
      exit()
    }

    // Wait for responses from export promises and update/display statistics.
    const processPendingEvents = async () => {
      if (pendingIndexerEvents.length === 0) {
        return
      }

      // For events with the same blockHeight, contractAddress, and key, only
      // keep the last event. This is because the indexer guarantees that events
      // are emitted in order, and the last event is the most up-to-date.
      // Multiple events may occur if the value is updated multiple times across
      // different messages. The indexer can only maintain uniqueness within a
      // message and its submessages, but different messages in the same block
      // can write to the same key, and the indexer emits all the messages.
      const uniqueIndexerEvents = pendingIndexerEvents.reduce((acc, event) => {
        const key = event.blockHeight + event.contractAddress + event.key
        acc[key] = event
        return acc
      }, {} as Record<string, IndexerEvent>)
      const eventsToExport = Object.values(uniqueIndexerEvents)

      const parsedEvents = eventsToExport.map((event) => {
        // Convert base64 value to utf-8 string, if present.
        const value =
          event.value && Buffer.from(event.value, 'base64').toString('utf-8')

        let valueJson = null
        if (!event.delete && value) {
          try {
            valueJson = JSON.parse(value ?? 'null')
          } catch {
            // Ignore parsing errors.
          }
        }

        return {
          codeId: event.codeId,
          contractAddress: event.contractAddress,
          blockHeight: event.blockHeight,
          blockTimeUnixMs: event.blockTimeUnixMicro / 1000n,
          blockTimestamp: new Date(
            (event.blockTimeUnixMicro / 1000n).toString()
          ),
          // Convert base64 key to comma-separated list of bytes. See
          // explanation in `Event` model for more information.
          key: Buffer.from(event.key, 'base64').join(','),
          value,
          valueJson,
          delete: event.delete,
        }
      })

      // Export events.
      const {
        contracts: updatedContracts,
        computationsUpdated: _computationsUpdated,
        computationsDestroyed: _computationsDestroyed,
        transformations: _transformations,
        webhooksQueued: _webhooksFired,
        lastBlockHeightExported,
      } = await exporter(parsedEvents, !options.update, !options.webhooks)

      // Update meilisearch indexes.
      await updateIndexesForContracts(updatedContracts)

      // Update statistics.
      processed += pendingIndexerEvents.length
      exported += parsedEvents.length
      latestBlockHeightExported = lastBlockHeightExported
      computationsUpdated += _computationsUpdated
      computationsDestroyed += _computationsDestroyed
      transformations += _transformations
      webhooksQueued += _webhooksFired

      // Clear queue.
      pendingIndexerEvents.length = 0
    }

    // Main logic.
    const read = async () => {
      try {
        reading = true

        const fileStream = fs.createReadStream(config.eventsFile, {
          start: bytesRead,
        })
        const rl = readline.createInterface({
          input: fileStream,
          // Recognize all instances of CR LF ('\r\n') as a single line break.
          crlfDelay: Infinity,
        })

        // Once we have successfully began reading (DB connected, file is open,
        // etc.), tell pm2 we're ready. Only do this the first time by checking
        // if we're still catching up.
        if (catchingUp && process.send) {
          process.send('ready')
        }

        let lastBlockHeightSeen = 0n
        for await (const line of rl) {
          if (shuttingDown) {
            printStatisticsAndExit()
            return
          }

          linesRead++

          if (!line) {
            continue
          }

          const event: IndexerEvent = JSON.parse(line)
          // If event not of expected structure, skip.
          if (
            !objectMatchesStructure(event, {
              blockHeight: {},
              blockTimeUnixMicro: {},
              contractAddress: {},
              codeId: {},
              key: {},
              value: {},
              delete: {},
            })
          ) {
            continue
          }

          // Convert bigints.
          event.blockHeight = BigInt(event.blockHeight)
          event.blockTimeUnixMicro = BigInt(event.blockTimeUnixMicro)

          // If event is from a block before the initial block, skip.
          if (event.blockHeight < initialBlock) {
            lastBlockHeightSeen = event.blockHeight
            continue
          } else if (catchingUp) {
            catchingUp = false
          }

          // If we have enough events and reached the first event of the next
          // block, flush the previous events to the DB. This ensures we batch
          // all events from the same block together.
          if (
            pendingIndexerEvents.length >= options.batch &&
            event.blockHeight > lastBlockHeightSeen
          ) {
            await processPendingEvents()
          }

          pendingIndexerEvents.push(event)
          lastBlockHeightSeen = event.blockHeight
        }

        // Flush remaining events.
        await processPendingEvents()

        // Update bytes read so we can start at this point in the next read.
        bytesRead += fileStream.bytesRead

        // Read again if pending.
        if (pendingRead) {
          pendingRead = false
          read()
        } else {
          if (shuttingDown) {
            printStatisticsAndExit()
            return
          }

          reading = false

          // If we made it to the end of the file, we are no longer catching up.
          if (catchingUp) {
            catchingUp = false
          }
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: {
            script: 'export',
          },
          extra: {
            bytesRead,
            latestBlockHeight,
          },
        })
        reject(err)
      }
    }

    // Watch file for changes every second and intelligently re-activate read
    // when more data is available.
    const file = fs.watchFile(
      config.eventsFile,
      { interval: 1000 },
      (curr, prev) => {
        if (shuttingDown) {
          return
        }

        // If modified, read if not already reading, and store that there is
        // data to read otherwise.
        if (curr.mtime > prev.mtime) {
          if (!reading) {
            read()
          } else {
            pendingRead = true
          }
        }
      }
    )
    file.on('error', reject)

    // Start reading file.
    read()
  })
}

// Update db state. Returns latest block height for log.
const updateState = async (): Promise<State> => {
  const { statusEndpoint } = loadConfig()
  const { data } = await axios.get(statusEndpoint, {
    // https://stackoverflow.com/a/74735197
    headers: { 'Accept-Encoding': 'gzip,deflate,compress' },
  })

  const chainId = data.result.node_info.network
  const latestBlockHeight = Number(data.result.sync_info.latest_block_height)
  const latestBlockTimeUnixMs = Date.parse(
    data.result.sync_info.latest_block_time
  )

  // Update state singleton with latest information.
  const [, [state]] = await State.update(
    {
      chainId,
      latestBlockHeight,
      latestBlockTimeUnixMs,
    },
    {
      where: {
        singleton: true,
      },
      returning: true,
    }
  )

  return state
}

// TODO: Create pipeline architecture, handle errors better, etc.
const exporter = async (
  parsedEvents: ParsedEvent[],
  dontUpdateComputations = false,
  dontSendWebhooks = false
): Promise<{
  contracts: Contract[]
  computationsUpdated: number
  computationsDestroyed: number
  transformations: number
  webhooksQueued: number
  lastBlockHeightExported: bigint
}> => {
  const state = await State.getSingleton()
  if (!state) {
    throw new Error('State not found while exporting')
  }

  const uniqueContracts = [
    ...new Set(parsedEvents.map((event) => event.contractAddress)),
  ]

  // Try to create contracts up to 3 times. This has previously failed due to a
  // deadlock.
  let contractCreationAttempts = 3
  while (contractCreationAttempts > 0) {
    try {
      // Ensure contract exists before creating events. `address` is unique.
      await Contract.bulkCreate(
        uniqueContracts.map((address) => ({
          address,
          codeId: parsedEvents.find(
            (event) => event.contractAddress === address
          )!.codeId,
        })),
        // When contract is migrated, codeId changes.
        {
          updateOnDuplicate: ['codeId'],
        }
      )

      // Break on success.
      break
    } catch (err) {
      console.error(err)
      Sentry.captureException(err, {
        tags: {
          script: 'export',
        },
        extra: {
          uniqueContracts,
        },
      })
      contractCreationAttempts--
    }
  }

  // Get updated contracts.
  const contracts = await Contract.findAll({
    where: {
      address: uniqueContracts,
    },
  })

  // Unique index on [blockHeight, contractAddress, key] ensures that we don't
  // insert duplicate events. If we encounter a duplicate, we update the
  // `value`, `valueJson`, and `delete` fields in case event processing for a
  // block was batched separately.
  const exportedEvents = await Event.bulkCreate(parsedEvents, {
    updateOnDuplicate: ['value', 'valueJson', 'delete'],
  })
  // Add contracts to events since webhooks need to access contract code IDs.
  exportedEvents.forEach((event) => {
    event.contract = contracts.find(
      (contract) => contract.address === event.contractAddress
    )!
  })

  // Transform events as needed.
  const transformations = await Transformation.transformParsedEvents(
    parsedEvents
  )

  // Queue webhooks as needed.
  const webhooksQueued = dontSendWebhooks
    ? 0
    : await PendingWebhook.queueWebhooks(state, exportedEvents)

  let updated = 0
  let destroyed = 0
  if (!dontUpdateComputations) {
    const computationUpdates =
      await updateComputationValidityDependentOnChanges(
        exportedEvents,
        transformations
      )
    updated = computationUpdates.updated
    destroyed = computationUpdates.destroyed
  }

  // Store last block height exported.
  const lastBlockHeightExported =
    parsedEvents[parsedEvents.length - 1].blockHeight
  await State.update(
    {
      lastBlockHeightExported: Sequelize.fn(
        'GREATEST',
        Sequelize.col('lastBlockHeightExported'),
        lastBlockHeightExported
      ),
    },
    {
      where: {
        singleton: true,
      },
    }
  )

  return {
    contracts,
    computationsUpdated: updated,
    computationsDestroyed: destroyed,
    transformations: transformations.length,
    lastBlockHeightExported,
    webhooksQueued: webhooksQueued || 0,
  }
}

main()

process.on('SIGINT', () => {
  shuttingDown = true
  if (!reading) {
    exit()
  }
})
