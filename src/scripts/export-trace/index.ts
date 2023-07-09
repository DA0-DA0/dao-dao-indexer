import * as fs from 'fs'
import path from 'path'

import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import * as Sentry from '@sentry/node'
import retry from 'async-await-retry'
import { Command } from 'commander'
import WebSocket from 'ws'

import { DbType, loadConfig, objectMatchesStructure } from '@/core'
import { State, loadDb } from '@/db'
import { setupMeilisearch } from '@/ms'

import { handlerMakers } from './handlers'
import { TracedEvent } from './types'
import { setUpFifoJsonTracer, setUpWebSocketNewBlockListener } from './utils'

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.option(
  '-b, --batch <size>',
  'batch size',
  (value) => parseInt(value, 10),
  1000
)
program.option(
  '-m, --modules <modules>',
  'comma-separated list of modules to export, falling back to all modules',
  (value) => value.split(',')
)
program.parse()
const { config: _config, batch, modules: _modules } = program.opts()

// Load config with config option.
const config = loadConfig(_config)

if (!config.home) {
  throw new Error('Config missing home directory.')
}

// Add Sentry error reporting.
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
  })
}

const traceFile = path.join(config.home, 'trace.pipe')
const updateFile = path.join(config.home, 'update.pipe')

let stateWebSocket: WebSocket | undefined

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

  // Ensure trace and update files exist.
  if (!fs.existsSync(traceFile)) {
    throw new Error(
      `Trace file not found: ${traceFile}. Create it with "mkfifo ${traceFile}".`
    )
  }
  if (!fs.existsSync(updateFile)) {
    throw new Error(
      `Update file not found: ${updateFile}. Create it with "mkfifo ${updateFile}".`
    )
  }

  // Verify trace and update files are FIFOs.
  const stat = fs.statSync(traceFile)
  if (!stat.isFIFO()) {
    throw new Error(`Trace file is not a FIFO: ${traceFile}.`)
  }
  const stat2 = fs.statSync(updateFile)
  if (!stat2.isFIFO()) {
    throw new Error(`Update file is not a FIFO: ${updateFile}.`)
  }

  const cosmWasmClient = await CosmWasmClient.connect(config.rpc)

  // Tell pm2 we're ready right before we start reading.
  if (process.send) {
    process.send('ready')
  }

  // Read from trace file.
  await trace(cosmWasmClient)
}

let shuttingDown = false
let reading = false

const trace = async (cosmWasmClient: CosmWasmClient) => {
  // Setup handlers.
  const handlers = await Promise.all(
    Object.entries(handlerMakers).map(async ([name, handlerMaker]) => ({
      name,
      handler: await handlerMaker({
        cosmWasmClient,
        config,
        batch,
        updateFile,
      }),
    }))
  )

  // Flush all handlers.
  const flushAll = async () => {
    for (const { name, handler } of handlers) {
      try {
        // Retry 3 times with exponential backoff starting at 100ms delay.
        await retry(handler.flush, [], {
          retriesMax: 3,
          exponential: true,
          interval: 100,
        })
      } catch (err) {
        console.error('-------\nFailed to flush:\n', err, '\n-------')
        Sentry.captureException(err, {
          tags: {
            type: 'failed-flush',
            script: 'export-trace',
          },
          extra: {
            handler: name,
          },
        })
        throw err
      }
    }
  }

  // Get new-block WebSocket.
  stateWebSocket = await setUpWebSocketNewBlockListener({
    rpc: config.rpc,
    onNewBlock: async (block) => {
      const { chain_id, height, time } = (block as any).header
      const latestBlockHeight = Number(height)
      const latestBlockTimeUnixMs = Date.parse(time)

      // Update state singleton with latest information.
      await State.update(
        {
          chainId: chain_id,
          latestBlockHeight,
          latestBlockTimeUnixMs,
        },
        {
          where: {
            singleton: true,
          },
        }
      )

      // Flush all handlers.
      await flushAll()
    },
  })

  console.log(`\n[${new Date().toISOString()}] Exporting from trace...`)

  const { promise: tracer, close: closeTracer } = setUpFifoJsonTracer({
    file: traceFile,
    onData: async (data) => {
      const tracedEvent = data as TracedEvent
      // Ensure this is a traced write event.
      if (
        !objectMatchesStructure(tracedEvent, {
          operation: {},
          key: {},
          value: {},
          metadata: {
            blockHeight: {},
            txHash: {},
          },
        })
      ) {
        return
      }

      // Only handle writes and deletes.
      if (
        tracedEvent.operation !== 'write' &&
        tracedEvent.operation !== 'delete'
      ) {
        return
      }

      // Try to handle with each module, and stop once handled.
      for (const { name, handler } of handlers) {
        try {
          // Retry 3 times with exponential backoff starting at 100ms delay.
          const handled = await retry(handler.handle, [tracedEvent], {
            retriesMax: 3,
            exponential: true,
            interval: 100,
          })

          // If handled, don't try other handlers.
          if (handled) {
            break
          }
        } catch (err) {
          console.error(
            '-------\nFailed to handle:\n',
            err,
            '\nHandler: ' +
              name +
              '\nData: ' +
              JSON.stringify(tracedEvent, null, 2) +
              '\n-------'
          )
          Sentry.captureException(err, {
            tags: {
              type: 'failed-handle',
              script: 'export-trace',
            },
            extra: {
              handler: name,
              tracedEvent,
            },
          })
          throw err
        }
      }
    },
    onProcessingStateChange: (processing) => {
      // Stop reading from FIFO if we're done processing and shutting down.
      if (!processing && shuttingDown) {
        closeTracer()
      }

      // Used to determine if we can kill the process immediately when SIGINT is
      // received.
      reading = processing
    },
  })

  // Wait for tracer to finish.
  await tracer

  // Tell each handler to flush once the socket closes.
  await flushAll()

  // Exit.
  console.log(`\n[${new Date().toISOString()}] Trace file closed.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

process.on('SIGINT', () => {
  if (stateWebSocket) {
    stateWebSocket.close()
  }

  if (!reading) {
    process.exit(0)
  }

  // If already shutting down, exit immediately.
  if (shuttingDown) {
    process.exit(1)
  }

  shuttingDown = true
  console.log('Shutting down after handlers finish...')
})
