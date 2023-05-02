import * as fs from 'fs'
import readline from 'readline'

import * as Sentry from '@sentry/node'
import axios from 'axios'
import { Command } from 'commander'

import { DbType, loadConfig } from '@/core'
import { State, loadDb } from '@/db'
import { setupMeilisearch } from '@/ms'

import { moduleMakers } from './modules'
import { ModuleExporter } from './types'

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
program.option(
  '-m, --modules <modules>',
  'comma-separated list of modules to export, falling back to all modules',
  (value) => value.split(',')
)
program.parse()
const {
  config: _config,
  initial,
  batch,
  update,
  webhooks,
  modules: _modules,
} = program.opts()

// Load config with config option.
const config = loadConfig(_config)

// Add Sentry error reporting.
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
  })
}

let readingPerModule: Record<string, boolean> = {}
// When true, shut down ASAP.
let shuttingDown = false

const exit = () => process.exit(0)

const main = async () => {
  // Load DB on start.
  await loadDb({
    type: DbType.Data,
  })
  await loadDb({
    type: DbType.Accounts,
  })
  // Setup meilisearch.
  await setupMeilisearch()

  // Initialize state.
  await State.createSingletonIfMissing()
  // Update state with latest from RPC.
  const initialState = await updateState()

  const modules = Object.entries(moduleMakers)
    .filter(
      ([name]) =>
        !_modules ||
        !Array.isArray(_modules) ||
        !_modules.length ||
        _modules.includes(name)
    )
    .map(([name, makeModule]): [string, ModuleExporter] => [
      name,
      makeModule({
        config,
        state: initialState,
        initialBlockHeight: initial || undefined,
        batch,
        updateComputations: !!update,
        sendWebhooks: !!webhooks,
      }),
    ])

  console.log(
    `\n[${new Date().toISOString()}] Exporting events from modules: ${modules
      .map(([name]) => name)
      .join(', ')}...`
  )

  // Ensure source files exist.
  modules.forEach(([name, { sourceFile }]) => {
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      throw new Error(`[${name}] Source file not found: ${sourceFile}`)
    }
  })

  // Tell pm2 we're ready right before we start reading.
  if (process.send) {
    process.send('ready')
  }

  return Promise.all([
    // Update state every second.
    new Promise(() => {
      // Update db state every second.
      const stateInterval = setInterval(async () => {
        await updateState()

        if (shuttingDown) {
          clearInterval(stateInterval)
        }
      }, 1000)
    }),
    // Module reads.
    ...modules.map((params) => makeModulePromise(...params)),
  ])
}

let lastBlockHeight = 0
// Update db state. Returns latest block height for log.
const updateState = async (): Promise<State> => {
  const { rpc } = loadConfig()
  const { data } = await axios.get(rpc + '/status', {
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

  // If block height changed, log it.
  if (lastBlockHeight && lastBlockHeight !== latestBlockHeight) {
    console.log(`Updated block height: ${latestBlockHeight.toLocaleString()}`)
  }
  lastBlockHeight = latestBlockHeight

  return state
}

const makeModulePromise = (
  name: string,
  { sourceFile, handler, flush }: ModuleExporter
) =>
  new Promise((_, reject) => {
    // Read state per module.
    let pendingRead = false
    let bytesRead = 0

    // Main logic. Read through each module.
    const read = async () => {
      if (shuttingDown) {
        return
      }

      try {
        readingPerModule[name] = true

        const fileStream = fs.createReadStream(sourceFile, {
          start: bytesRead,
        })
        const rl = readline.createInterface({
          input: fileStream,
          // Recognize all instances of CR LF ('\r\n') as a single line break.
          crlfDelay: Infinity,
        })

        for await (const line of rl) {
          if (shuttingDown) {
            exit()
            return
          }

          if (!line) {
            continue
          }

          // Send to module handler.
          await handler(line)
        }

        // Tell module to flush once we finish reading.
        await flush()

        // Update bytes read so we can start at this point in the next read.
        bytesRead += fileStream.bytesRead

        // Stop reading if shutting down.
        if (shuttingDown) {
          readingPerModule[name] = false
          return
        }

        // Read again if pending.
        if (pendingRead) {
          pendingRead = false
          read()
        } else {
          readingPerModule[name] = false
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: {
            script: 'export',
            module: name,
          },
          extra: {
            bytesRead,
          },
        })
        reject(err)
      }
    }

    // Watch files for changes every half a second and read when more data is
    // available.
    const file = fs.watchFile(sourceFile, { interval: 500 }, (curr, prev) => {
      if (shuttingDown) {
        return
      }

      // If modified, read if not already reading, and store that there is
      // data to read otherwise.
      if (curr.mtime > prev.mtime) {
        if (!readingPerModule[name]) {
          read()
        } else {
          pendingRead = true
        }
      }
    })
    file.on('error', reject)

    // Start reading.
    read()
  })

main()

process.on('SIGINT', () => {
  shuttingDown = true
  // If no modules are reading, exit.
  if (!Object.values(readingPerModule).some(Boolean)) {
    exit()
  }

  console.log('Shutting down after modules finish their current tasks...')
  setInterval(() => {
    if (!Object.values(readingPerModule).some(Boolean)) {
      exit()
    }
  }, 1000)
})
