import * as fs from 'fs'
import path from 'path'
import readline from 'readline'

import { loadConfig } from '../config'
import { dbExporter } from './dbExporter'
import { IndexerEvent } from './types'

const BULK_INSERT_SIZE = 500
const LOADER_MAP = ['—', '\\', '|', '/']

const main = async () => {
  // Make DB exporter.
  const config = await loadConfig()

  const eventsFile = path.join(config.indexerRoot, '.events.txt')
  // Ensure events file exists.
  if (!fs.existsSync(eventsFile)) {
    throw new Error(`Events file not found (${eventsFile}).`)
  }

  console.log(`\n\n[${new Date().toISOString()}] Exporting events...`)

  // Return promise that never resolves. Listen for file changes.
  return new Promise((_, reject) => {
    // Read state.
    let reading = false
    let pendingRead = false
    let bytesRead = 0

    // Pending events and statistics.
    const pendingIndexerEvents: IndexerEvent[] = []
    let processed = 0

    // Wait for responses from export promises and update/display statistics.
    const flushToDb = async () => {
      // Wait for export to finish.
      await dbExporter(pendingIndexerEvents)

      // Update statistics.
      processed += pendingIndexerEvents.length

      // Clear queue.
      pendingIndexerEvents.length = 0
    }

    // Main logic.
    const read = async () => {
      reading = true

      const fileStream = fs.createReadStream(eventsFile, {
        start: bytesRead,
      })
      const rl = readline.createInterface({
        input: fileStream,
        // Recognize all instances of CR LF ('\r\n') as a single line break.
        crlfDelay: Infinity,
      })

      try {
        for await (const line of rl) {
          const event: IndexerEvent = JSON.parse(line)
          pendingIndexerEvents.push(event)

          // If we have enough events, flush them to the DB.
          if (pendingIndexerEvents.length === BULK_INSERT_SIZE) {
            await flushToDb()
          }
        }

        // Flush remaining events.
        await flushToDb()

        // Update bytes read.
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
    const interval = setInterval(() => {
      printLoaderCount = (printLoaderCount + 1) % LOADER_MAP.length
      process.stdout.write(
        `\r${
          LOADER_MAP[printLoaderCount]
        }  ${processed.toLocaleString()} processed.`
      )
    }, 100)
    // Allow process to exit even though this interval is alive.
    interval.unref()
  })
}

main()
