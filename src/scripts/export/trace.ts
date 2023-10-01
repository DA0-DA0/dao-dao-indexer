import * as fs from 'fs'
import path from 'path'

import * as Sentry from '@sentry/node'
import retry from 'async-await-retry'
import { Command } from 'commander'
import { LRUCache } from 'lru-cache'
import waitPort from 'wait-port'

import {
  DbType,
  EXPORT_QUEUE_NAME,
  getBullQueue,
  loadConfig,
  objectMatchesStructure,
} from '@/core'
import { State, loadDb } from '@/db'
import { setupMeilisearch } from '@/ms'

import { handlerMakers } from './handlers'
import { ExportQueueData, TracedEvent, TracedEventWithBlockTime } from './types'
import {
  getCosmWasmClient,
  setUpFifoJsonTracer,
  setUpWebSocketNewBlockListener,
} from './utils'

const MAX_QUEUE_SIZE = 5000
const MAX_BATCH_SIZE = 5000

// Parse arguments.
const program = new Command()
program.option(
  '-c, --config <path>',
  'path to config file, falling back to config.json'
)
program.option(
  // Adds inverted `ws` boolean to the options object.
  '--no-ws',
  "don't connect to websocket"
)
program.parse()
const { config: _config, ws: webSocketEnabled } = program.opts()

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

const trace = async () => {
  const dataSequelize = await loadDb({
    type: DbType.Data,
  })

  // Initialize state.
  await State.createSingletonIfMissing()

  const exportQueue = getBullQueue<{ data: ExportQueueData[] }>(
    EXPORT_QUEUE_NAME
  )

  // Create CosmWasm client that batches requests.
  const cosmWasmClient = await getCosmWasmClient(config.rpc)

  // Helper function that gets block time for height, cached in memory, which is
  // filled in by the NewBlock WebSocket listener.
  const blockHeightToTimeCache = new LRUCache<number, number>({
    max: 100,
  })
  const getBlockTimeUnixMs = async (trace: TracedEvent): Promise<number> => {
    const { blockHeight } = trace.metadata

    if (blockHeightToTimeCache.has(blockHeight)) {
      return blockHeightToTimeCache.get(blockHeight) ?? 0
    }

    // This may fail if the RPC does not have the block info at this height
    // anymore (i.e. if it's too old and the RPC pruned it)
    const loadIntoCache = async () => {
      const {
        header: { time },
      } = await cosmWasmClient.getBlock(blockHeight)
      blockHeightToTimeCache.set(blockHeight, Date.parse(time))
    }

    try {
      // Retry 3 times with exponential backoff starting at 150ms delay.
      await retry(loadIntoCache, [], {
        retriesMax: 3,
        exponential: true,
        interval: 150,
      })
    } catch (err) {
      console.error(
        '-------\nFailed to get block:\n',
        err instanceof Error ? err.message : err,
        '\nBlock height: ' +
          BigInt(blockHeight).toLocaleString() +
          '\nData: ' +
          JSON.stringify(trace, null, 2) +
          '\n-------'
      )

      // Only log to Sentry if not block height unavailable error.
      if (
        !(err instanceof Error) ||
        !err.message.includes('must be less than or equal to the current')
      ) {
        Sentry.captureException(err, {
          tags: {
            type: 'failed-get-block',
            script: 'export',
            chainId: (await State.getSingleton())?.chainId ?? 'unknown',
          },
          extra: {
            trace,
            blockHeight,
          },
        })
      }

      // Set to 0 on failure so we can continue.
      blockHeightToTimeCache.set(blockHeight, 0)
    }

    return blockHeightToTimeCache.get(blockHeight) ?? 0
  }

  // Set up handlers.
  const handlers = await Promise.all(
    Object.entries(handlerMakers).map(async ([name, handlerMaker]) => ({
      name,
      handler: await handlerMaker({
        config,
        cosmWasmClient,
        // These are only relevant when processing, not tracing.
        updateComputations: false,
        sendWebhooks: false,
      }),
    }))
  )

  console.log(`\n[${new Date().toISOString()}] Exporting from trace...`)

  let webSocketReady = false
  const traceQueue: TracedEvent[] = []
  let traceExportPaused = false
  let traceExporter = Promise.resolve()
  let exporting = 0

  // Batch events and group by block height.
  let exportBatch: {
    handler: string
    data: any
    trace: TracedEvent
  }[] = []
  let exportTraceBatchDebounce: NodeJS.Timeout | null = null
  const exportTraceBatch = () => {
    if (exportTraceBatchDebounce !== null) {
      clearTimeout(exportTraceBatchDebounce)
      exportTraceBatchDebounce = null
    }

    if (exportBatch.length) {
      exportQueue.add(
        BigInt(
          exportBatch[exportBatch.length - 1].trace.metadata.blockHeight
        ).toString(),
        {
          data: exportBatch.map(
            ({ handler, data }): ExportQueueData => ({
              handler,
              data,
            })
          ),
        }
      )
      exportBatch = []
    }
  }

  const exportTrace = async () => {
    const trace = traceQueue.shift()
    try {
      if (!trace) {
        return
      }

      // Fetch block time.
      const blockTimeUnixMs = await getBlockTimeUnixMs(trace)
      const eventWithBlockTime: TracedEventWithBlockTime = {
        ...trace,
        blockTimeUnixMs,
      }

      // Match traces with handlers and get queue data.
      const matchedData = handlers
        .filter(
          ({ handler }) =>
            // Filter by store if present. Osmosis, for example, does not emit
            // store_name in metadata, so try all handlers.
            !trace.metadata.store_name ||
            handler.storeName === trace.metadata.store_name
        )
        .flatMap(({ name, handler }) => {
          const data = handler.match(eventWithBlockTime)
          return data
            ? {
                handler: name,
                data,
                trace,
              }
            : []
        })

      // If this trace is a newer block height than the last trace, export the
      // previous batch before batching this one.
      if (
        exportBatch.length > 0 &&
        trace.metadata.blockHeight >
          exportBatch[exportBatch.length - 1].trace.metadata.blockHeight
      ) {
        exportTraceBatch()
      }

      exportBatch.push(...matchedData)

      // If batch size reached, immediately export.
      if (exportBatch.length >= MAX_BATCH_SIZE) {
        exportTraceBatch()
      } else if (matchedData.length) {
        // Otherwise, if queued new data, debounce export.
        if (exportTraceBatchDebounce !== null) {
          clearTimeout(exportTraceBatchDebounce)
        }
        exportTraceBatchDebounce = setTimeout(exportTraceBatch, 200)
      }
    } catch (err) {
      console.error(
        '-------\nFailed to export trace:\n',
        err instanceof Error ? err.message : err,
        '\nBlock height: ' +
          BigInt(trace?.metadata.blockHeight ?? '-1').toLocaleString() +
          '\nData: ' +
          JSON.stringify(trace, null, 2) +
          '\n-------'
      )

      Sentry.captureException(err, {
        tags: {
          type: 'failed-export-trace',
          script: 'export',
          chainId: (await State.getSingleton())?.chainId ?? 'unknown',
        },
        extra: {
          trace,
        },
      })
    } finally {
      exporting--
    }
  }

  // Process traced events queue by exporting to a job queue until a certain
  // concurrency is reached, then pause until the queue is drained.
  const processTraceQueue = () => {
    if (
      traceExportPaused ||
      // If WebSocket is enabled, pause trace queue until WebSocket is ready.
      (webSocketEnabled && !webSocketReady)
    ) {
      return
    }

    // Export traces until the trace queue is empty or the trace exporter queue
    // is full.
    for (let i = 0; i < traceQueue.length; i++) {
      exporting++
      traceExporter = traceExporter.then(exportTrace)

      // If trace exporter queue fills up, pause until it drains.
      if (exporting >= MAX_QUEUE_SIZE) {
        traceExportPaused = true

        // Resume once queue drains.
        const interval = setInterval(() => {
          if (exporting < MAX_QUEUE_SIZE / 5) {
            traceExportPaused = false
            clearInterval(interval)
            processTraceQueue()
          }
        }, 100)

        break
      }
    }
  }

  // Tell pm2 we're ready right before we start reading.
  if (process.send) {
    process.send('ready')
  }

  const { promise: tracer, close: closeTracer } = setUpFifoJsonTracer({
    file: traceFile,
    onData: (data) => {
      const tracedEvent = data as TracedEvent
      // Ensure this is a traced write or delete event.
      if (
        !objectMatchesStructure(tracedEvent, {
          operation: {},
          key: {},
          value: {},
          metadata: {
            blockHeight: {},
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

      traceQueue.push(tracedEvent)
      processTraceQueue()
    },
  })

  // If WebSocket enabled, connect to it before queueing.
  if (webSocketEnabled) {
    // Connect to local RPC WebSocket once ready. We need to read from the trace
    // as the server is starting but not start processing the queue until the
    // WebSocket block listener has connected. This is because the trace blocks
    // the server from starting, but we can only listen for new blocks once the
    // WebSocket is connected at some point after the server has started. We
    // have to read from the trace to allow the server to start up.
    waitPort({
      host: 'localhost',
      port: 26657,
      output: 'silent',
    }).then(async ({ open }) => {
      if (open) {
        const setUpWebSocket = () => {
          // Get new-block WebSocket.
          const webSocket = setUpWebSocketNewBlockListener({
            rpc: 'http://127.0.0.1:26657',
            onNewBlock: async (block) => {
              const { chain_id, height, time } = (block as any).header
              const latestBlockHeight = Number(height)
              const latestBlockTimeUnixMs = Date.parse(time)

              // Cache block time for block height in cache used by state.
              blockHeightToTimeCache.set(
                latestBlockHeight,
                latestBlockTimeUnixMs
              )

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
            },
            onConnect: () => {
              console.log('WebSocket connected.')
              webSocketReady = true
              processTraceQueue()
            },
            onError: async (error) => {
              // If fails to connect, retry after three seconds.
              if (error.message.includes('ECONNREFUSED')) {
                console.error(
                  'Failed to connect to WebSocket. Retrying in 3 seconds...',
                  error
                )
                webSocket.terminate()

                setTimeout(setUpWebSocket, 3000)
              } else {
                console.error('WebSocket error', error)

                Sentry.captureException(error, {
                  tags: {
                    type: 'websocket-error',
                    script: 'export',
                    chainId: (await State.getSingleton())?.chainId ?? 'unknown',
                  },
                })
              }
            },
          })
        }

        setUpWebSocket()
      } else {
        console.error(
          'Failed to connect to local RPC WebSocket. Queries may be slower as block times will be fetched from a remote RPC.'
        )

        Sentry.captureMessage(
          'Failed to connect to local RPC WebSocket (not open).',
          {
            tags: {
              type: 'failed-websocket-connection',
              script: 'export',
              chainId: (await State.getSingleton())?.chainId ?? 'unknown',
            },
          }
        )

        webSocketReady = true
        processTraceQueue()
      }
    })
  }

  // Add shutdown signal handler.
  process.on('SIGINT', () => {
    // Tell tracer to close. The rest of the data in the buffer will finish
    // processing.
    closeTracer()
    console.log('Shutting down after handlers finish...')
  })

  // Wait for tracer to close. Happens on FIFO closure or if `closeTracer` is
  // manually called, such as in the SIGINT handler above.
  await tracer

  // Wait for queue to finish processing.
  await new Promise<void>((resolve) => {
    console.log(
      `Shutting down after the queue drains ${traceQueue.length.toLocaleString()} events and ${exporting.toLocaleString()} others finish processing...`
    )

    const interval = setInterval(() => {
      if (exporting === 0 && traceQueue.length === 0) {
        clearInterval(interval)
        resolve()
      }
    }, 50)
  })

  // Close database connection.
  await dataSequelize.close()

  // Close queue.
  await exportQueue.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
