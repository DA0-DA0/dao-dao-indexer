import * as fs from 'fs'
import path from 'path'
import readline from 'readline'

import { makeExporter } from './db/exporter'
import { Config, IndexerEvent } from './types'

const INDEXER_ROOT = '/Users/noah/.juno/indexer'
const EVENTS_FILE = path.join(INDEXER_ROOT, '.events.txt')
const CONFIG_FILE = path.join(INDEXER_ROOT, 'config.json')

const STATUS_MAP = ['—', '\\', '|', '/']

const main = async () => {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Config not found (${CONFIG_FILE}).`)
  }

  const config: Config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))

  // Make exporter.
  const exporter = await makeExporter(config)

  // Export files.
  if (!fs.existsSync(EVENTS_FILE)) {
    throw new Error(`Events file not found (${EVENTS_FILE}).`)
  }

  console.log('\nExporting events...')

  // Return promise that never resolves. Listen for file changes.
  return new Promise((_, reject) => {
    // Read iterator state.
    let reading = false
    let pendingRead = false
    let bytesRead = 0

    // Batched export group and statistics.
    const exportGroup: Promise<boolean>[] = []
    let alreadyExistedCount = 0
    let newlyCreatedCount = 0
    let groupsProcessed = 0

    // Wait for responses from export promises and update/display statistics.
    const waitForExportGroup = async () => {
      const created = await Promise.all(exportGroup)

      // Compute statistics.
      const newlyCreated = created.filter(Boolean).length
      newlyCreatedCount += newlyCreated
      alreadyExistedCount += created.length - newlyCreated
      groupsProcessed += 1

      process.stdout.write(
        `\r${
          STATUS_MAP[groupsProcessed % STATUS_MAP.length]
        }  ${alreadyExistedCount.toLocaleString()} exist. ${newlyCreatedCount.toLocaleString()} created. ${(
          alreadyExistedCount + newlyCreatedCount
        ).toLocaleString()} total.`
      )

      // Clear promises.
      exportGroup.length = 0
    }

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
          exportGroup.push(exporter(event))

          // If we have a lot of events, wait for them to finish before
          // continuing. This allows errors to be thrown but still lets us batch
          // queries.
          if (exportGroup.length === 200) {
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

    // Watch file for changes.
    const file = fs.watchFile(EVENTS_FILE, (curr, prev) => {
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
  })
}

main()
