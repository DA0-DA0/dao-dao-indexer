import * as fs from 'fs'
import readline from 'readline'

import axios from 'axios'
import { Command } from 'commander'

import { IndexerEvent, ParsedEvent, loadConfig } from '@/core'
import { Contract, Event, State, Transformation, loadDb } from '@/db'
import { setupMeilisearch, updateIndexesForContracts } from '@/ms'

import { objectMatchesStructure } from './utils'

const BULK_INSERT_SIZE = 500
const LOADER_MAP = ['—', '\\', '|', '/']

const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.option(
    '-b, --block <height>',
    'block height to start exporting from, falling back to the beginning of the events file'
  )
  program.parse()
  const options = program.opts()

  console.log(`\n\n[${new Date().toISOString()}] Exporting events...`)

  // Load config with config option.
  const config = loadConfig(options.config)

  const eventsFile = config.eventsFile || ''
  // Ensure events file exists.
  if (!eventsFile || !fs.existsSync(eventsFile)) {
    throw new Error(`Events file not found (${eventsFile}).`)
  }

  // Load DB on start.
  await loadDb()
  // Setup meilisearch.
  await setupMeilisearch()

  // Initialize state.
  const initialBlockHeight = await updateState()

  // Return promise that never resolves. Listen for file changes.
  return new Promise((_, reject) => {
    let latestBlockHeight = initialBlockHeight
    // Update db state every 3 seconds.
    const stateInterval = setInterval(async () => {
      latestBlockHeight = await updateState()
    }, 3000)
    // Allow process to exit even though this interval is alive.
    stateInterval.unref()

    // Read state.
    let reading = false
    let pendingRead = false
    let bytesRead = 0
    let lastBlockHeightExported = 0

    // Pending events and statistics.
    const pendingIndexerEvents: IndexerEvent[] = []
    let processed = 0
    let exported = 0
    let computationsUpdated = 0
    let computationsDestroyed = 0
    let transformations = 0

    // Wait for responses from export promises and update/display statistics.
    const flushToDb = async () => {
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
          blockTimeUnixMs: Math.round(event.blockTimeUnixMicro / 1000),
          blockTimestamp: new Date(event.blockTimeUnixMicro / 1000),
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
      } = await exporter(parsedEvents)

      // Update meilisearch indexes.
      await updateIndexesForContracts(updatedContracts)

      // Update statistics.
      processed += pendingIndexerEvents.length
      exported += parsedEvents.length
      lastBlockHeightExported =
        pendingIndexerEvents[pendingIndexerEvents.length - 1].blockHeight
      computationsUpdated += _computationsUpdated
      computationsDestroyed += _computationsDestroyed
      transformations += _transformations

      // Clear queue.
      pendingIndexerEvents.length = 0
    }

    // Main logic.
    const read = async () => {
      try {
        reading = true

        const fileStream = fs.createReadStream(eventsFile, {
          start: bytesRead,
        })
        const rl = readline.createInterface({
          input: fileStream,
          // Recognize all instances of CR LF ('\r\n') as a single line break.
          crlfDelay: Infinity,
        })

        for await (const line of rl) {
          if (!line) {
            continue
          }

          const event = JSON.parse(line)
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

          // If event is from a block before the start block, skip.
          if (options.block && event.blockHeight < Number(options.block)) {
            lastBlockHeightExported = event.blockHeight
            continue
          }

          pendingIndexerEvents.push(event)

          // If we have enough events, flush them to the DB.
          if (pendingIndexerEvents.length === BULK_INSERT_SIZE) {
            await flushToDb()
          }
        }

        // Flush remaining events.
        await flushToDb()

        // Update bytes read so we can start at this point in the next read.
        bytesRead += fileStream.bytesRead

        // Read again if pending.
        if (pendingRead) {
          pendingRead = false
          read()
        } else {
          reading = false
        }
      } catch (err) {
        reject(err)
      }
    }

    // Watch file for changes every second and intelligently re-activate read
    // when more data is available.
    const file = fs.watchFile(eventsFile, { interval: 1000 }, (curr, prev) => {
      // If modified, read if not already reading, and store that there is data
      // to read otherwise.
      if (curr.mtime > prev.mtime) {
        if (!reading) {
          read()
        } else {
          pendingRead = true
        }
      }
    })
    file.on('error', reject)

    // Start reading file.
    read()

    // Print latest statistics every 100ms.
    let printLoaderCount = 0
    const logInterval = setInterval(() => {
      printLoaderCount = (printLoaderCount + 1) % LOADER_MAP.length
      process.stdout.write(
        `\r${
          LOADER_MAP[printLoaderCount]
        }  Processed/exported: ${processed.toLocaleString()}/${exported.toLocaleString()}. Latest block exported: ${lastBlockHeightExported.toLocaleString()}. Latest block: ${latestBlockHeight.toLocaleString()}. Computations updated/destroyed: ${computationsUpdated.toLocaleString()}/${computationsDestroyed.toLocaleString()}. Transformed: ${transformations.toLocaleString()}.`
      )
    }, 100)
    // Allow process to exit even though this interval is alive.
    logInterval.unref()
  })
}

// Update db state. Returns latest block height for log.
const updateState = async (): Promise<number> => {
  const { statusEndpoint } = loadConfig()
  const { data } = await axios.get(statusEndpoint, {
    // https://stackoverflow.com/a/74735197
    headers: { 'Accept-Encoding': 'gzip,deflate,compress' },
  })

  const latestBlockHeight = Number(data.result.sync_info.latest_block_height)
  const latestBlockTimeUnixMs = Date.parse(
    data.result.sync_info.latest_block_time
  )

  // Update state singleton with latest information.
  await State.upsert({
    singleton: true,
    latestBlockHeight,
    latestBlockTimeUnixMs,
  })

  return latestBlockHeight
}

const exporter = async (
  parsedEvents: ParsedEvent[]
): Promise<{
  contracts: Contract[]
  computationsUpdated: number
  computationsDestroyed: number
  transformations: number
}> => {
  const state = await State.getSingleton()
  if (!state) {
    throw new Error('State not found while exporting')
  }

  const uniqueContracts = [
    ...new Set(parsedEvents.map((event) => event.contractAddress)),
  ]

  // Ensure contract exists before creating events. `address` is unique.
  await Contract.bulkCreate(
    uniqueContracts.map((address) => ({
      address,
      codeId: parsedEvents.find((event) => event.contractAddress === address)!
        .codeId,
    })),
    {
      ignoreDuplicates: true,
    }
  )

  // Unique index on [blockHeight, contractAddress, key] ensures that we don't
  // insert duplicate events. If we encounter a duplicate, we update the
  // `value`, `valueJson`, and `delete` fields in case event processing for a
  // block was batched separately.
  await Event.bulkCreate(parsedEvents, {
    updateOnDuplicate: ['value', 'valueJson', 'delete'],
  })

  // Transform events as needed.
  const transformations = await Transformation.transformEvents(parsedEvents)

  // Don't update computation validity for now.
  // const { updated, destroyed } =
  //   await updateComputationValidityDependentOnChanges(
  //     exportedEvents,
  //     transformations
  //   )

  // Get updated contracts.
  const contracts = await Contract.findAll({
    where: {
      address: uniqueContracts,
    },
  })

  return {
    contracts,
    computationsUpdated: 0, // updated,
    computationsDestroyed: 0, // destroyed,
    transformations: transformations.length,
  }
}

main()
