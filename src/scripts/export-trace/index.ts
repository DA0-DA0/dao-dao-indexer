import * as fs from 'fs'

import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import * as Sentry from '@sentry/node'
import { Command } from 'commander'

import { DbType, loadConfig, objectMatchesStructure } from '@/core'
import { State, loadDb } from '@/db'
import { setupMeilisearch } from '@/ms'

import { handlerMakers } from './handlers'
import { TracedEvent } from './types'

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
  '-f, --flush <seconds>',
  'flush at least every n seconds',
  (value) => parseInt(value, 10),
  2
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
  batch,
  flush,
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

  // Ensure trace file exists.
  if (!config.trace || !fs.existsSync(config.trace)) {
    throw new Error(
      `Trace file not found: ${config.trace}. Create it with "mkfifo ${config.trace}".`
    )
  }

  // Verify trace file is a FIFO.
  const stat = fs.statSync(config.trace)
  if (!stat.isFIFO()) {
    throw new Error(`Trace file is not a FIFO: ${config.trace}.`)
  }

  const cosmWasmClient = await CosmWasmClient.connect(config.rpc)

  // Tell pm2 we're ready right before we start reading.
  if (process.send) {
    process.send('ready')
  }

  // Update state singleton.
  await updateState(cosmWasmClient)

  // Read from trace file.
  await trace(cosmWasmClient)
}

// Update db state. Returns latest block height for log.
const updateState = async (cosmWasmClient: CosmWasmClient): Promise<void> => {
  const chainId = await cosmWasmClient.getChainId()
  const latestBlockHeight = await cosmWasmClient.getHeight()
  const latestBlockTimeUnixMs = Date.parse(
    (await cosmWasmClient.getBlock(latestBlockHeight)).header.time
  )

  // Update state singleton with latest information.
  await State.update(
    {
      chainId,
      latestBlockHeight,
      latestBlockTimeUnixMs,
    },
    {
      where: {
        singleton: true,
      },
    }
  )
}

let shuttingDown = false

const trace = async (cosmWasmClient: CosmWasmClient) => {
  // Setup handlers.
  const handlers = await Promise.all(
    Object.entries(handlerMakers).map(async ([name, handlerMaker]) => ({
      name,
      handler: await handlerMaker({
        cosmWasmClient,
        config,
        batch,
        updateComputations: !!update,
        sendWebhooks: !!webhooks,
      }),
    }))
  )

  const fifoRs = fs.createReadStream(config.trace, {
    encoding: 'utf-8',
  })

  // Flush all handlers.
  const flushAll = async () => {
    for (const { handler } of handlers) {
      let tries = 3
      while (tries > 0) {
        try {
          await handler.flush()
          break
        } catch (err) {
          tries--

          if (tries > 0) {
            console.error(`Failed to flush. Trying ${tries} more time(s)...`)
          } else {
            console.error('Failed to flush. Giving up.')
            Sentry.captureException(err, {
              tags: {
                type: 'failed-flush',
                script: 'export-trace',
              },
            })
          }
        }
      }
    }
  }

  // Flush every n seconds.
  setInterval(flushAll, flush * 1000).unref()

  console.log(`\n[${new Date().toISOString()}] Exporting from trace...`)

  let buffer = ''
  fifoRs.on('data', (chunk) => {
    // Pause before processing this chunk.
    fifoRs.pause()
    // Resume at the end of the chunk processing.
    ;(async () => {
      try {
        if (!chunk || typeof chunk !== 'string') {
          return
        }

        // Chunk ends in newline.
        const lines = chunk.trimEnd().split('\n')

        for (const line of lines) {
          // Ignore empty line.
          if (!line) {
            continue
          }

          // Only begin buffer with a JSON object.
          if (!buffer && !line.startsWith('{')) {
            throw new Error(`Invalid line beginning: ${line}`)
          }

          buffer += line

          // Check if buffer is a valid JSON object, and process if so.
          let tracedEvent: TracedEvent | undefined
          try {
            tracedEvent = JSON.parse(buffer)
          } catch (err) {
            // If invalid but begins correctly, continue buffering.
            if (
              err instanceof SyntaxError &&
              err.message.includes('Unexpected end of JSON input')
            ) {
              console.log(
                'JSON incomplete from buffer. Buffering...',
                JSON.stringify(
                  {
                    chunk,
                    buffer,
                    line,
                  },
                  null,
                  2
                )
              )
              continue
            }

            // Capture other unexpected errors and ignore.
            console.error(
              'Failed to parse JSON',
              err,
              JSON.stringify(
                {
                  chunk,
                  buffer,
                  line,
                },
                null,
                2
              )
            )
            Sentry.captureException(err, {
              tags: {
                type: 'ignored-trace',
                script: 'export-trace',
              },
              extra: {
                chunk,
                buffer,
                line,
              },
            })

            // Reset buffer after processing and ignore.
            buffer = ''
            continue
          }

          try {
            // Ensure this is a traced write event. Otherwise, reset buffer.
            if (
              !tracedEvent ||
              !objectMatchesStructure(tracedEvent, {
                operation: {},
                key: {},
                value: {},
                metadata: {
                  blockHeight: {},
                  txHash: {},
                },
              }) ||
              (tracedEvent.operation !== 'write' &&
                tracedEvent.operation !== 'delete')
            ) {
              continue
            }

            // Try to handle with each module, and stop once handled.
            for (const { name, handler } of handlers) {
              let handled = false

              let tries = 3
              while (tries > 0) {
                try {
                  handled = await handler.handle(tracedEvent)
                  break
                } catch (err) {
                  tries--

                  if (tries > 0) {
                    console.error(
                      `[${name}] Failed to handle. Trying ${tries} more time(s)...`,
                      err,
                      JSON.stringify(tracedEvent, null, 2)
                    )
                  } else {
                    console.error(`[${name}] Failed to handle. Giving up.`)
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
                  }
                }
              }

              // If handled, stop trying other handlers.
              if (handled) {
                break
              }
            }
          } finally {
            // Reset buffer after processing.
            buffer = ''
          }
        }
      } finally {
        // If shutting down, close the stream.
        if (shuttingDown) {
          fifoRs.close()
        } else {
          // Other resume after processing this chunk.
          fifoRs.resume()
        }
      }
    })()
  })

  // Wait for trace file to close.
  await new Promise((resolve) => fifoRs.on('close', resolve))

  // Tell each handler to flush once the socket closes.
  await flushAll()

  if (!fifoRs.closed) {
    fifoRs.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

process.on('SIGINT', () => {
  // If already shutting down, exit immediately.
  if (shuttingDown) {
    process.exit(1)
  }

  shuttingDown = true
  console.log('Shutting down after handlers finish...')
})
