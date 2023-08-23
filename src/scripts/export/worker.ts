import { parentPort, workerData } from 'worker_threads'

import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import { HttpBatchClient, Tendermint34Client } from '@cosmjs/tendermint-rpc'
import * as Sentry from '@sentry/node'
import retry from 'async-await-retry'
import { LRUCache } from 'lru-cache'
import waitPort from 'wait-port'

import { DbType } from '@/core'
import { State, loadDb } from '@/db'

import { handlerMakers } from './handlers'
import { FromWorkerMessage, ToWorkerMessage, WorkerInitData } from './types'
import { setUpWebSocketNewBlockListener } from './utils'

const main = async () => {
  if (!parentPort) {
    throw new Error('Must be run as a Worker')
  }

  const { config, update, webhooks } = workerData as WorkerInitData

  // Add Sentry error reporting.
  if (config.sentryDsn) {
    Sentry.init({
      dsn: config.sentryDsn,
    })
  }

  // Load DB on start.
  await loadDb({
    type: DbType.Data,
  })
  await loadDb({
    type: DbType.Accounts,
  })

  // Initialize state.
  await State.createSingletonIfMissing()

  // Create CosmWasm client that batches requests.
  const httpClient = new HttpBatchClient(config.rpc)
  const tmClient = await Tendermint34Client.create(httpClient)
  // @ts-ignore
  const cosmWasmClient = new CosmWasmClient(tmClient)

  // Setup handlers.
  const blockHeightToTimeCache = new LRUCache<number, number>({
    max: 100,
  })
  const handlers = await Promise.all(
    Object.entries(handlerMakers).map(async ([name, handlerMaker]) => ({
      name,
      handler: await handlerMaker({
        blockHeightToTimeCache,
        cosmWasmClient,
        config,
        dontUpdateComputations: !update,
        dontSendWebhooks: !webhooks,
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
        console.error(
          '-------\nFailed to flush:\n',
          err instanceof Error ? err.message : err,
          '\n-------'
        )
        Sentry.captureException(err, {
          tags: {
            type: 'failed-flush',
            script: 'export',
          },
          extra: {
            handler: name,
          },
        })
        throw err
      }
    }
  }

  let webSocketConnected = false
  let queueHandler: Promise<void> = new Promise<void>((resolve) => {
    // Wait for WebSocket to be ready.
    //
    // We need to read from the trace as the server is starting but not start
    // processing the queue until the WebSocket block listener has connected.
    // This is because the trace blocks the server from starting, but we can
    // only listen for new blocks once the WebSocket is connected at some point
    // after the server has started. We have to read from the trace to allow the
    // server to start up.

    // Wait for WebSocket to be ready.
    setInterval(() => {
      if (webSocketConnected) {
        resolve()
      }
    })
  })

  // Connect to local RPC WebSocket once ready. Don't await since we need to
  // start reading from the trace FIFO before the RPC starts.
  waitPort({
    host: 'localhost',
    port: 26657,
    output: 'silent',
  }).then(({ open }) => {
    if (open) {
      const setUpWebSocket = () => {
        // Get new-block WebSocket.
        const webSocket = setUpWebSocketNewBlockListener({
          rpc: 'http://localhost:26657',
          onNewBlock: async (block) => {
            const { chain_id, height, time } = (block as any).header
            const latestBlockHeight = Number(height)
            const latestBlockTimeUnixMs = Date.parse(time)

            console.log('New block', latestBlockHeight)

            // Cache block time for block height in cache used by state.
            blockHeightToTimeCache.set(latestBlockHeight, latestBlockTimeUnixMs)

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
            webSocketConnected = true
            console.log('WebSocket connected.')
          },
          onError: (error) => {
            // If fails to connect, retry after three seconds.
            if (error.message.includes('ECONNREFUSED')) {
              console.error('Failed to connect to WebSocket.')
              webSocket.terminate()

              setTimeout(setUpWebSocket, 3000)
            }
          },
        })
      }

      setUpWebSocket()
    } else {
      console.error(
        'Failed to connect to local RPC WebSocket. Queries may be slower as block times will be fetched from a remote RPC.'
      )
    }
  })

  let processed = 0
  // Update parent on processed count.
  setInterval(() => {
    parentPort!.postMessage({
      type: 'processed',
      count: processed,
    } as FromWorkerMessage)

    // Reset processed count.
    processed = 0
  }, 100).unref()

  parentPort.on('message', (message: ToWorkerMessage) => {
    if (message.type === 'trace') {
      const tracedEvent = message.event

      // Handle event after previous event is handled.
      queueHandler = (queueHandler || Promise.resolve()).then(async () => {
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
              err instanceof Error ? err.message : err,
              '\nHandler: ' +
                name +
                '\nData: ' +
                JSON.stringify(tracedEvent, null, 2) +
                '\n-------'
            )
            Sentry.captureException(err, {
              tags: {
                type: 'failed-handle',
                script: 'export',
              },
              extra: {
                handler: name,
                tracedEvent,
              },
            })
          }
        }

        // Increment processed count.
        processed++
      })
    } else if (message.type === 'shutdown') {
      ;(async () => {
        // Wait for queue to finish.
        await queueHandler

        // Flush all handlers.
        await flushAll()

        // Exit worker process.
        process.exit(0)
      })()
    }
  })

  // Tell parent we're ready to process traces.
  parentPort.postMessage({
    type: 'ready',
  })
}

main().catch((err) => {
  console.error('Worker errored', err)
  process.exit(1)
})
