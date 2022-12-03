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

  const fileStream = fs.createReadStream(EVENTS_FILE)
  const rl = readline.createInterface({
    input: fileStream,
    // Recognize all instances of CR LF ('\r\n') in as a single line break.
    crlfDelay: Infinity,
  })

  console.log(`\nExporting events...`)

  // Parse each line and dispatch exporter promise.
  const exportPromises: Promise<boolean>[] = []
  let alreadyExistedCount = 0
  let newlyCreatedCount = 0
  let groupsProcessed = 0
  for await (const line of rl) {
    const event: IndexerEvent = JSON.parse(line)
    exportPromises.push(exporter(event))

    // If we have a lot of events, wait for them to finish before continuing.
    // This allows errors to be thrown but still lets us batch queries.
    if (exportPromises.length === 100) {
      const created = await Promise.all(exportPromises)

      // Compute statistics.
      const newlyCreated = created.filter(Boolean).length
      newlyCreatedCount += newlyCreated
      alreadyExistedCount += created.length - newlyCreated
      groupsProcessed += 1

      process.stdout.write(
        `\r${
          STATUS_MAP[groupsProcessed % STATUS_MAP.length]
        }  ${alreadyExistedCount.toLocaleString()} already exist — ${newlyCreatedCount.toLocaleString()} created`
      )

      // Clear promises.
      exportPromises.length = 0
    }
  }
}

main()
