import * as fs from 'fs'
import path from 'path'

import * as Sentry from '@sentry/node'
import retry from 'async-await-retry'
import { Command } from 'commander'
import { LRUCache } from 'lru-cache'
import waitPort from 'wait-port'

import { ConfigManager } from '@/config'
import { State, loadDb } from '@/db'
import { ExportQueue } from '@/queues/queues/export'
import { setupMeilisearch } from '@/search'
import { WasmCodeService } from '@/services/wasm-codes'
import {
  handlerMakers,
  setUpFifoJsonTracer,
  setUpWebSocketNewBlockListener,
} from '@/tracer'
import { DbType, TracedEvent, TracedEventWithBlockTime } from '@/types'
import { getCosmWasmClient, objectMatchesStructure } from '@/utils'

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
program.option(
  '-o, --output <path>',
  'optionally write streamed state to another file, acting as a passthrough'
)
program.option('--allow-no-fifo', 'allow trace file to not be a FIFO file')
program.parse()
const {
  config: _config,
  output,
  ws: webSocketEnabled,
  allowNoFifo,
} = program.opts()

// Load config from specific config file.
const config = ConfigManager.load(_config)

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
  // Ensure trace file exists.
  if (!fs.existsSync(traceFile)) {
    throw new Error(
      `Trace file not found: ${traceFile}. Create it with "mkfifo ${traceFile}".`
    )
  }

  // Verify trace file is FIFOs.
  if (!allowNoFifo) {
    const stat = fs.statSync(traceFile)
    if (!stat.isFIFO()) {
      throw new Error(`Trace file is not a FIFO: ${traceFile}.`)
    }
  }

  const dataSequelize = await loadDb({
    type: DbType.Data,
  })

  // Set up wasm code service.
  await WasmCodeService.setUpInstance({
    withUpdater: true,
  })

  // Initialize state.
  await State.createSingletonIfMissing()

  // Set up meilisearch.
  await setupMeilisearch()

  // Create write stream for output if configured.
  const outputStream = output
    ? fs.createWriteStream(output, {
        flags: 'a',
      })
    : null

  // Create CosmWasm client that batches requests.
  const cosmWasmClient = await getCosmWasmClient(config.rpc)

  // Helper function that gets block time for height, cached in memory, which is
  // filled in by the NewBlock WebSocket listener.
  const blockHeightToTimeCache = new LRUCache<number, number>({
    max: 1000,
  })
  const getBlockTimeUnixMs = async (trace: TracedEvent): Promise<number> => {
    const { blockHeight } = trace.metadata

    // If not in cache but WebSocket is connected and every block is less than
    // the current one, wait for up to 3 seconds for it to be added to the
    // cache. We might be just a moment ahead of the new block event.
    if (!blockHeightToTimeCache.has(blockHeight) && webSocketConnected) {
      const blockHeights = blockHeightToTimeCache.dump().map(([key]) => key)
      if (blockHeights.every((b) => b < blockHeight)) {
        const time = await new Promise<number | undefined>((resolve) => {
          const interval = setInterval(() => {
            if (blockHeightToTimeCache.has(blockHeight)) {
              clearInterval(interval)
              clearTimeout(timeout)
              resolve(blockHeightToTimeCache.get(blockHeight))
            }
          }, 50)

          const timeout = setTimeout(() => {
            const blockHeights = blockHeightToTimeCache
              .dump()
              .map(([key]) => key)
            const earliestBlockHeight = blockHeights.reduce(
              (acc, curr) => (curr < acc ? curr : acc),
              Infinity
            )
            const latestBlockHeight = blockHeights.reduce(
              (acc, curr) => (curr > acc ? curr : acc),
              -Infinity
            )

            console.log(
              `[${new Date().toISOString()}] Timed out waiting for ${blockHeight.toLocaleString()}'s time... (${earliestBlockHeight.toLocaleString()} — ${latestBlockHeight.toLocaleString()})`
            )
            clearInterval(interval)
            resolve(undefined)
          }, 3000)
        })

        if (time !== undefined) {
          return time
        }
      }
    }

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

  let webSocketConnected = false
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
      // For state events with the same ID, only keep the last event. This is
      // because the indexer guarantees that events are emitted in order, and
      // the last event is the most up-to-date. Multiple events may occur if a
      // state key is updated multiple times across different messages within
      // the same block.
      const uniqueBatchData = Object.values(
        exportBatch.reduce(
          (acc, data, index) => ({
            ...acc,
            [data.handler + ':' + data.data.id]: {
              ...data,
              index,
            },
          }),
          {} as Record<string, typeof exportBatch[number] & { index: number }>
        )
      )
      // Ensure order is preserved.
      uniqueBatchData.sort((a, b) => a.index - b.index)

      const blockHeight = BigInt(
        exportBatch[exportBatch.length - 1].trace.metadata.blockHeight
      )
      if (uniqueBatchData.length) {
        ExportQueue.add(
          blockHeight.toString(),
          uniqueBatchData.map(({ handler, data }) => {
            // Remove ID since it's no longer relevant.
            delete data.id

            return {
              handler,
              data,
            }
          })
        )
      }

      console.log(
        `\n[${new Date().toISOString()}] Exported ${exportBatch.length.toLocaleString()} events for block ${blockHeight.toLocaleString()}.`
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
        exportTraceBatchDebounce = setTimeout(exportTraceBatch, 500)
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
          script: 'export:trace',
          chainId: (await State.getSingleton())?.chainId ?? 'unknown',
        },
        extra: {
          trace,
        },
      })
    } finally {
      exporting--

      // If no more events being exported, reset trace exporter queue promise
      // variable so that memory of the promises in the chain can be cleaned up.
      if (exporting === 0) {
        traceExporter = Promise.resolve()
      }
    }
  }

  // Process traced events queue by exporting to a job queue until a certain
  // concurrency is reached, then pause until the queue is drained.
  const processTraceQueue = () => {
    if (traceExportPaused) {
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

  let shuttingDown = false

  const { promise: tracer, close: closeTracer } = setUpFifoJsonTracer({
    file: traceFile,
    onData: (data) => {
      const tracedEvent = data as TracedEvent

      // Output if configured.
      outputStream?.write(JSON.stringify(tracedEvent) + '\n')

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

      // If trace has `store_name` that does not exist in any of the handlers,
      // ignore.
      if (
        tracedEvent.metadata.store_name &&
        !handlers.some(
          ({ handler }) => handler.storeName === tracedEvent.metadata.store_name
        )
      ) {
        return
      }

      traceQueue.push(tracedEvent)
      processTraceQueue()
    },
  })

  // If WebSocket enabled, connect to it before queueing.
  if (webSocketEnabled) {
    console.log(`[${new Date().toISOString()}] Connecting to WebSocket...`)
    // Set a 1-minute interval that logs how many events are queued until the
    // WebSocket is ready. This helps verify that the node is doing something
    // even when no output is being produced from the node. This happens during
    // upgrades that can occasionally take hours.
    let lastTraceQueueLength = 0
    let traceQueueUpdaterInterval: NodeJS.Timer | null = setInterval(() => {
      console.log(
        `[${new Date().toISOString()}] Trace queue size: ${
          traceQueue.length
        } (+${traceQueue.length - lastTraceQueueLength})`
      )
      lastTraceQueueLength = traceQueue.length
    }, 60 * 1000)
    const stopTraceQueueUpdater = () => {
      if (traceQueueUpdaterInterval === null) {
        return
      }

      clearInterval(traceQueueUpdaterInterval as unknown as number)
      traceQueueUpdaterInterval = null
    }

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

              // Update state singleton with chain ID and latest block.
              await State.update(
                {
                  chainId: chain_id,
                  latestBlockHeight: BigInt(latestBlockHeight).toString(),
                  latestBlockTimeUnixMs: BigInt(
                    latestBlockTimeUnixMs
                  ).toString(),
                },
                { where: { singleton: true } }
              )
            },
            onConnect: () => {
              stopTraceQueueUpdater()
              webSocketConnected = true

              console.log(`[${new Date().toISOString()}] WebSocket connected.`)
            },
            onError: async (error) => {
              stopTraceQueueUpdater()
              webSocketConnected = false
              webSocket.terminate()

              if (shuttingDown) {
                return
              }

              // On error and not shutting down, reconnect.
              console.error(
                `[${new Date().toISOString()}] WebSocket errored, reconnecting in 1 second...`,
                error
              )
              Sentry.captureException(error, {
                tags: {
                  type: 'websocket-error',
                  script: 'export',
                  chainId: (await State.getSingleton())?.chainId ?? 'unknown',
                },
              })

              setTimeout(setUpWebSocket, 1000)
            },
            onClose: () => {
              // If already disconnected, from onError, do nothing.
              if (!webSocketConnected) {
                return
              }

              stopTraceQueueUpdater()
              webSocketConnected = false

              if (shuttingDown) {
                return
              }

              // On close and not shutting down, reconnect.
              console.error(
                `[${new Date().toISOString()}] WebSocket closed, reconnecting in 1 second...`
              )
              setTimeout(setUpWebSocket, 1000)
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
      }
    })
  }

  // Add shutdown signal handler.
  process.on('SIGINT', () => {
    shuttingDown = true
    // Tell tracer to close. The rest of the data in the buffer will finish
    // processing.
    closeTracer()
    console.log(
      `[${new Date().toISOString()}] Shutting down after handlers finish...`
    )
  })

  // Add user signal handler to log variables.
  process.on('SIGUSR1', () => {
    console.log(
      [
        'SIGUSR1:',
        `Memory: ${JSON.stringify(process.memoryUsage(), null, 2)}`,
        `Exporting: ${exporting.toLocaleString()}`,
        `Trace queue size: ${traceQueue.length.toLocaleString()}`,
        `Export batch size: ${exportBatch.length.toLocaleString()}`,
      ].join('\n')
    )
  })

  // Wait for tracer to close. Happens on FIFO closure or if `closeTracer` is
  // manually called, such as in the SIGINT handler above.
  await tracer

  // Wait for queue to finish processing.
  await new Promise<void>((resolve) => {
    if (exporting === 0 && traceQueue.length === 0) {
      resolve()
      return
    }

    console.log(
      `[${new Date().toISOString()}] Shutting down after the queue drains ${traceQueue.length.toLocaleString()} traces and ${exporting.toLocaleString()} finish exporting...`
    )

    const interval = setInterval(() => {
      if (
        exporting === 0 &&
        traceQueue.length === 0 &&
        exportBatch.length === 0
      ) {
        clearInterval(interval)
        resolve()
      }
    }, 50)
  })

  await traceExporter

  // Stop services.
  WasmCodeService.getInstance().stopUpdater()

  // Close database connection.
  await dataSequelize.close()

  // Close queue.
  await ExportQueue.close()

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
