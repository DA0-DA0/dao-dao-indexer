import * as fs from 'fs'
import readline from 'readline'

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

let reading = false
// When true, shut down ASAP.
let shuttingDown = false

const exit = () => {
  setReadingFile(false)
  process.exit(0)
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

  console.log(`\n[${new Date().toISOString()}] Exporting from trace`)

  // Ensure trace file exists.
  if (!config.trace || !fs.existsSync(config.trace)) {
    fs.closeSync(fs.openSync(config.trace, 'w'))
  }

  let cosmWasmClient: CosmWasmClient | undefined
  try {
    cosmWasmClient = await CosmWasmClient.connect(config.rpc)
  } catch {
    // If failed, use alt RPC.
    cosmWasmClient = await CosmWasmClient.connect(config.altRpc)
  }
  const altCosmWasmClient = await CosmWasmClient.connect(config.altRpc)

  if (!cosmWasmClient) {
    throw new Error('Failed to connect to RPC and alt RPC.')
  }

  // Tell pm2 we're ready right before we start reading.
  if (process.send) {
    process.send('ready')
  }

  return Promise.all([
    // Update state every second.
    new Promise(() => {
      // Update db state every second.
      const stateInterval = setInterval(async () => {
        await updateState(cosmWasmClient!, altCosmWasmClient)

        if (shuttingDown) {
          clearInterval(stateInterval)
        }
      }, 1000)
    }),
    // Start reading.
    reader(cosmWasmClient, altCosmWasmClient),
  ])
}

// Create or remove trace reading file.
const setReadingFile = (reading: boolean) => {
  const readingFile = config.trace + '.reading'
  if (reading) {
    fs.closeSync(fs.openSync(readingFile, 'w'))
  } else {
    if (fs.existsSync(readingFile)) {
      fs.unlinkSync(readingFile)
    }
  }
}

let lastBlockHeight = 0
// Update db state. Returns latest block height for log.
const updateState = async (
  cosmWasmClient: CosmWasmClient,
  altCosmWasmClient: CosmWasmClient
): Promise<State> => {
  let chainId: string | undefined
  let latestBlockHeight: number | undefined
  let latestBlockTimeUnixMs: number | undefined
  try {
    chainId = await cosmWasmClient.getChainId()
    latestBlockHeight = await cosmWasmClient.getHeight()
    latestBlockTimeUnixMs = Date.parse(
      (await cosmWasmClient.getBlock(latestBlockHeight)).header.time
    )
  } catch {
    // If failed, use alt RPC.
    try {
      chainId = await altCosmWasmClient.getChainId()
      latestBlockHeight = await altCosmWasmClient.getHeight()
      latestBlockTimeUnixMs = Date.parse(
        (await altCosmWasmClient.getBlock(latestBlockHeight)).header.time
      )
    } catch {}
  }

  if (
    !chainId ||
    latestBlockHeight === undefined ||
    latestBlockTimeUnixMs === undefined
  ) {
    const state = await State.getSingleton()
    if (!state) {
      throw new Error('Failed to get State singleton.')
    }

    lastBlockHeight = Number(state.latestBlockHeight ?? '0')
    console.error(
      `Failed to get status from RPC and alt RPC. Are they both down? Latest block height: ${lastBlockHeight.toLocaleString()}`
    )

    return state
  }

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

const reader = (
  cosmWasmClient: CosmWasmClient,
  altCosmWasmClient: CosmWasmClient
) =>
  new Promise(async (_, reject) => {
    // Update state with latest from RPC.
    const initialState = await updateState(cosmWasmClient, altCosmWasmClient)

    // Setup handlers.
    const handlers = handlerMakers.map((handlerMaker) =>
      handlerMaker({
        cosmWasmClient,
        altCosmWasmClient,
        config,
        batch,
        updateComputations: !!update,
        sendWebhooks: !!webhooks,
      })
    )

    const initialBlock =
      initial !== undefined
        ? initial
        : // Start at the next block after the last exported block if no initial
          // block set.
          BigInt(initialState.lastWasmBlockHeightExported ?? '0') + 1n

    console.log(
      `Catching up to initial block ${initialBlock.toLocaleString()}...`
    )

    let catchingUp = true

    // Read state per module.
    let pendingRead = false
    let bytesRead = 0

    // Main logic. Read through each module.
    const read = async () => {
      if (shuttingDown) {
        return
      }

      try {
        reading = true
        setReadingFile(true)

        const fileStream = fs.createReadStream(config.trace, {
          start: bytesRead,
        })
        const rl = readline.createInterface({
          input: fileStream,
          // Recognize all instances of CR LF ('\r\n') as a single line break.
          crlfDelay: Infinity,
          terminal: false,
        })

        // Buffer lines until we have a full JSON object.
        let bufferedLine = ''
        let noBufferReset = false

        for await (const line of rl) {
          // Reset buffer if we read a line without a full JSON object.
          if (!noBufferReset) {
            bufferedLine = ''
            noBufferReset = false
          }

          if (shuttingDown) {
            exit()
            return
          }

          if (!line) {
            noBufferReset = false
            continue
          }

          bufferedLine += line
          // Validate JSON. If invalid, buffer and wait for next line. This is
          // necessary if we start reading a line before it is fully written.
          // The first pass will read the first part of the line, and the second
          // pass will read the rest of the line.
          let tracedEvent: TracedEvent | undefined
          try {
            tracedEvent = JSON.parse(bufferedLine)
          } catch (err) {
            noBufferReset = true
            console.log(
              'Partial line read, buffering...',
              err,
              bufferedLine,
              line
            )
            await new Promise((resolve) => setTimeout(resolve, 2000))
            continue
          }

          // Ensure this is a traced write event.
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

          // If trace is from a block before the initial block, skip.
          if (BigInt(tracedEvent.metadata.blockHeight) < initialBlock) {
            continue
          } else if (catchingUp) {
            console.log(
              `Caught up to initial block ${initialBlock.toLocaleString()}.`
            )
            catchingUp = false
          }

          // Try to handle each line with each module, and stop once handled.
          for (const handler of handlers) {
            try {
              const handled = await handler.handle(tracedEvent)
              if (handled) {
                break
              }
            } catch (err) {
              console.error('Failed to handle event', err)
              // Restart the read without flushing or updating bytes read.
              read()
              return
            }
          }
        }

        // Tell each handler to flush once we finish reading.
        for (const handler of handlers) {
          try {
            await handler.flush()
          } catch (err) {
            console.error('Failed to flush', err)
            // Restart the read without updating bytes read.
            read()
            return
          }
        }

        // Update bytes read so we can start at this point in the next read.
        bytesRead += fileStream.bytesRead

        // Stop reading if shutting down.
        if (shuttingDown) {
          reading = false
          return
        }

        // Read again if pending.
        if (pendingRead) {
          console.log('Finished reading and continuing due to more available.')
          pendingRead = false
          read()
        } else {
          reading = false
          console.log('Finished reading trace file.')
        }
      } catch (err) {
        reading = false
        Sentry.captureException(err, {
          tags: {
            script: 'export-trace',
          },
          extra: {
            bytesRead,
          },
        })
        reject(err)
      } finally {
        if (!reading) {
          setReadingFile(false)
        }
      }
    }

    // Watch file for changes every half a second and read when more data is
    // available.
    const file = fs.watchFile(config.trace, { interval: 500 }, (curr, prev) => {
      if (shuttingDown) {
        return
      }

      // If modified, read if not already reading, and store that there is
      // data to read otherwise.
      if (curr.mtime > prev.mtime) {
        if (!reading) {
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
  if (!reading) {
    exit()
  }

  console.log('Shutting down after handlers finish...')
  setInterval(() => {
    if (!reading) {
      exit()
    }
  }, 1000)
})
