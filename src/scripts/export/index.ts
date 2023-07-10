import * as fs from 'fs'
import path from 'path'
import { Worker } from 'worker_threads'

import * as Sentry from '@sentry/node'
import { Command } from 'commander'

import { loadConfig, objectMatchesStructure } from '@/core'
import { setupMeilisearch } from '@/ms'

import {
  FromWorkerMessage,
  ToWorkerMessage,
  TracedEvent,
  WorkerInitData,
} from './types'
import { setUpFifoJsonTracer } from './utils'

const MAX_QUEUE_SIZE = 5000

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
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
const { config: _config, update, webhooks } = program.opts()

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

const main = async () => {
  // Setup meilisearch.
  await setupMeilisearch()

  // Ensure trace and update files exist.
  if (!fs.existsSync(traceFile)) {
    throw new Error(
      `Trace file not found: ${traceFile}. Create it with "mkfifo ${traceFile}".`
    )
  }

  // Verify trace and update files are FIFOs.
  const stat = fs.statSync(traceFile)
  if (!stat.isFIFO()) {
    throw new Error(`Trace file is not a FIFO: ${traceFile}.`)
  }

  // Read from trace file.
  await trace()
}

let shuttingDown = false
let reading = false

const trace = async () => {
  const workerData: WorkerInitData = {
    config,
    update: !!update,
    webhooks: !!webhooks,
  }
  const worker = new Worker(path.join(__dirname, 'worker.js'), {
    workerData,
  })

  let queued = 0
  // Listen for worker processing queue.
  worker.on('message', async (data: FromWorkerMessage) => {
    if (data.type === 'ready') {
      console.log(`\n[${new Date().toISOString()}] Exporting from trace...`)

      // Tell pm2 we're ready right before we start reading.
      if (process.send) {
        process.send('ready')
      }

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

          worker.postMessage({
            type: 'trace',
            event: tracedEvent,
          } as ToWorkerMessage)
          queued += 1

          // If queue fills up, wait for it to drain halfway.
          if (queued >= MAX_QUEUE_SIZE) {
            console.log('Queue full, waiting for it to drain...')
            await new Promise<void>((resolve) => {
              const interval = setInterval(() => {
                if (queued < MAX_QUEUE_SIZE / 2) {
                  console.log('Queue drained.')
                  clearInterval(interval)
                  resolve()
                }
              }, 50)
            })
          }
        },
        onProcessingStateChange: async (processing) => {
          // Used to determine if we can kill the process immediately when
          // SIGINT is received.
          reading = processing

          // Stop reading from FIFO if we're done processing and shutting down.
          if (!processing && shuttingDown) {
            closeTracer()
          }
        },
      })

      // Add worker exit handler.
      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker stopped with exit code ${code}`)
        }

        // Exit with worker's exit code.
        process.exit(code)
      })

      // Add shutdown signal handler.
      process.on('SIGINT', () => {
        // If already shutting down, exit immediately.
        if (shuttingDown) {
          process.exit(1)
        }

        shuttingDown = true
        console.log('Shutting down after handlers finish...')

        // If not currently tracing, stop tracer and tell worker to shutdown.
        if (!reading) {
          closeTracer()
        }
      })

      // Wait for tracer to close.
      await tracer

      // Tell worker to shutdown.
      worker.postMessage({
        type: 'shutdown',
      } as ToWorkerMessage)
    } else if (data.type === 'processed') {
      queued -= data.count
    }
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
