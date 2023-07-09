import * as fs from 'fs'
import path from 'path'

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
        updateFile,
      }),
    }))
  )

  const fifoRs = fs.createReadStream(traceFile, {
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
            console.error(
              '-------\n',
              `Failed to flush. Trying ${tries} more time(s)...\n`,
              err instanceof Error ? err.message : `${err}`,
              '\n-------'
            )
          } else {
            console.error(
              '-------\n',
              'Failed to flush. Giving up.\n',
              err instanceof Error ? err.message : `${err}`,
              '\n-------'
            )
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

  console.log(`\n[${new Date().toISOString()}] Exporting from trace...`)

  let buffer = ''
  let lastBlockHeightSeen = 0
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
              '-------\n',
              'Failed to parse JSON\n',
              err,
              '\n' +
                JSON.stringify(
                  {
                    chunk,
                    buffer,
                    line,
                  },
                  null,
                  2
                ),
              '\n-------'
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
              })
            ) {
              continue
            }

            // On detect start of next block, flush all handlers. This is
            // probably a read of the `baseapp/BlockParams` key.
            if (tracedEvent.metadata.blockHeight > lastBlockHeightSeen) {
              await flushAll()
            }

            lastBlockHeightSeen = tracedEvent.metadata.blockHeight

            // Only handle writes and deletes.
            if (
              tracedEvent.operation !== 'write' &&
              tracedEvent.operation !== 'delete'
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
                      '-------\n',
                      `[${name}] Failed to handle. Trying ${tries} more time(s)...`,
                      '\n' + JSON.stringify(tracedEvent, null, 2) + '\n',
                      err,
                      '\n-------'
                    )
                  } else {
                    console.error(
                      '-------\n',
                      `[${name}] Failed to handle. Giving up.`,
                      '\n' + JSON.stringify(tracedEvent, null, 2) + '\n',
                      err,
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

  console.log(`\n[${new Date().toISOString()}] Trace file closed.`)

  // Exit after handlers finish.
  process.exit(0)
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
