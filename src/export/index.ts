import * as fs from 'fs'
import path from 'path'
import readline from 'readline'

import { INDEXER_ROOT, loadConfig } from '../config'
import { makeDbExporter } from './dbExporter'
import { IndexerEvent } from './types'

const EVENTS_FILE = path.join(INDEXER_ROOT, '.events.txt')
const MAX_PARALLEL_EXPORTS = 200
const LOADER_MAP = ['—', '\\', '|', '/']

const main = async () => {
  // Ensure events file exists.
  if (!fs.existsSync(EVENTS_FILE)) {
    throw new Error(`Events file not found (${EVENTS_FILE}).`)
  }

  // Make DB exporter.
  const config = await loadConfig()
  const dbExporter = await makeDbExporter(config)

  console.log('\nExporting events...')

  // Return promise that never resolves. Listen for file changes.
  return new Promise((_, reject) => {
    // Read state.
    let reading = false
    let pendingRead = false
    let bytesRead = 0

    // Parallelized exports and statistics.
    const parallelExports: Promise<boolean>[] = []
    let alreadyExistedCount = 0
    let newlyCreatedCount = 0

    // Wait for responses from export promises and update/display statistics.
    const waitForExportGroup = async () => {
      const created = await Promise.all(parallelExports)

      // Update statistics.
      const newlyCreated = created.filter(Boolean).length
      newlyCreatedCount += newlyCreated
      alreadyExistedCount += created.length - newlyCreated

      // Clear promises.
      parallelExports.length = 0
    }

    // Main logic.
    const read = async () => {
      reading = true

      const fileStream = fs.createReadStream(EVENTS_FILE, {
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
          parallelExports.push(dbExporter(event))

          // If we have a lot of events, wait for them to finish before
          // continuing. This allows errors to be thrown but still lets us
          // parallelize queries.
          if (parallelExports.length === MAX_PARALLEL_EXPORTS) {
            await waitForExportGroup()
          }
        }

        // Wait for remaining promises.
        await waitForExportGroup()

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
    const file = fs.watchFile(EVENTS_FILE, { interval: 1000 }, (curr, prev) => {
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
        }  ${alreadyExistedCount.toLocaleString()} exist. ${newlyCreatedCount.toLocaleString()} created. ${(
          alreadyExistedCount + newlyCreatedCount
        ).toLocaleString()} total.\x1B[?25l`
      )
    }, 100)
    // Allow process to exit even though this interval is alive.
    interval.unref()
  })
}

main()

// Show cursor on exit.
const showCursor = () => process.stdout.write('\x1B[?25h')

process.on('exit', (code) => {
  showCursor()
  process.exit(code)
})
// Forward signals by only handling once and retriggering.
process.once('SIGINT', () => {
  showCursor()
  process.kill(process.pid, 'SIGINT')
})
process.once('SIGUSR1', () => {
  showCursor()
  process.kill(process.pid, 'SIGUSR1')
})
process.once('SIGUSR2', () => {
  showCursor()
  process.kill(process.pid, 'SIGUSR2')
})
