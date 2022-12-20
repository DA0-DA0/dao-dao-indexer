import * as fs from 'fs'
import path from 'path'
import readline from 'readline'

import { Command } from 'commander'

import { loadConfig } from '../config'
import { loadDb } from '../db'
import { setupMeilisearch, updateIndexesForContracts } from '../meilisearch'
import { exporter, updateState } from './db'
import { IndexerEvent } from './types'
import { objectMatchesStructure } from './utils'

const BULK_INSERT_SIZE = 500
const LOADER_MAP = ['—', '\\', '|', '/']

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.parse()
const options = program.opts()

const main = async () => {
  console.log(`\n\n[${new Date().toISOString()}] Exporting events...`)

  // Load config with config option.
  const config = await loadConfig(options.config)

  let eventsFile = config.eventsFile || ''
  if (!eventsFile && config.indexerRoot) {
    eventsFile = path.join(config.indexerRoot, '.events.txt')
  }
  // Ensure events file exists.
  if (!eventsFile || !fs.existsSync(eventsFile)) {
    throw new Error(`Events file not found (${eventsFile}).`)
  }

  // Load DB on start.
  await loadDb()
  // Setup meilisearch.
  await setupMeilisearch()

  // Return promise that never resolves. Listen for file changes.
  return new Promise((_, reject) => {
    let latestBlockHeight = -1
    // Initialize state.
    updateState().then((blockHeight) => {
      latestBlockHeight = blockHeight
    })
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

      // Export events to DB.
      const updatedContracts = await exporter(eventsToExport)
      // Update meilisearch indexes.
      await updateIndexesForContracts(updatedContracts)

      // Update statistics.
      processed += pendingIndexerEvents.length
      exported += eventsToExport.length
      lastBlockHeightExported =
        pendingIndexerEvents[pendingIndexerEvents.length - 1].blockHeight

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
        }  ${processed.toLocaleString()} processed. ${exported.toLocaleString()} exported. Last block height with export: ${lastBlockHeightExported.toLocaleString()}. Latest block height: ${latestBlockHeight.toLocaleString()}.`
      )
    }, 100)
    // Allow process to exit even though this interval is alive.
    logInterval.unref()
  })
}

main()
