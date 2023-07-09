import * as fs from 'fs'
import path from 'path'

import * as Sentry from '@sentry/node'
import { Command } from 'commander'
import { Sequelize } from 'sequelize-typescript'

import { DbType, loadConfig, objectMatchesStructure } from '@/core'
import {
  AccountWebhook,
  Contract,
  PendingWebhook,
  State,
  WasmStateEvent,
  WasmStateEventTransformation,
  loadDb,
  updateComputationValidityDependentOnChanges,
} from '@/db'
import { setupMeilisearch, updateIndexesForContracts } from '@/ms'

import { UpdateMessage } from './types'

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
const { config: _config, update, webhooks, modules: _modules } = program.opts()

const dontUpdateComputations = !update
const dontSendWebhooks = !webhooks

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

  // Ensure update file exists.
  if (!fs.existsSync(updateFile)) {
    throw new Error(
      `Update file not found: ${updateFile}. Create it with "mkfifo ${updateFile}".`
    )
  }

  // Verify trace file is a FIFO.
  const stat = fs.statSync(updateFile)
  if (!stat.isFIFO()) {
    throw new Error(`Update file is not a FIFO: ${updateFile}.`)
  }

  // Tell pm2 we're ready right before we start reading.
  if (process.send) {
    process.send('ready')
  }

  // Read from update file.
  await run()
}

let shuttingDown = false

const run = async () => {
  const fifoRs = fs.createReadStream(updateFile, {
    encoding: 'utf-8',
  })

  console.log(`\n[${new Date().toISOString()}] Updating...`)

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
          let update: UpdateMessage | undefined
          try {
            update = JSON.parse(buffer)
          } catch (err) {
            // If invalid but begins correctly, continue buffering.
            if (
              err instanceof SyntaxError &&
              err.message.includes('Unexpected end of JSON input')
            ) {
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
                type: 'ignored-update',
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
            // Ensure this is an update event. Otherwise, reset buffer.
            if (
              !update ||
              !objectMatchesStructure(update, {
                type: {},
                eventIds: {},
                transformationIds: {},
              })
            ) {
              continue
            }

            const state = await State.getSingleton()
            if (!state) {
              throw new Error('State not found while updating.')
            }

            const events = await WasmStateEvent.findAll({
              where: {
                id: update.eventIds,
              },
              order: [['blockHeight', 'ASC']],
              include: Contract,
            })
            const transformations = await WasmStateEventTransformation.findAll({
              where: {
                id: update.transformationIds,
              },
              order: [['blockHeight', 'ASC']],
              include: Contract,
            })

            let computationsUpdated = 0
            let computationsDestroyed = 0
            if (!dontUpdateComputations) {
              const computationUpdates =
                await updateComputationValidityDependentOnChanges([
                  ...events,
                  ...transformations,
                ])
              computationsUpdated = computationUpdates.updated
              computationsDestroyed = computationUpdates.destroyed
            }

            // Queue webhooks as needed.
            const webhooksQueued =
              dontSendWebhooks || events.length === 0
                ? 0
                : (await PendingWebhook.queueWebhooks(state, events)) +
                  (await AccountWebhook.queueWebhooks(events))

            // Store last block height exported, and update latest block
            // height/time if the last export is newer.
            const lastBlockHeightExported =
              events[events.length - 1].blockHeight
            const lastBlockTimeUnixMsExported =
              events[events.length - 1].blockTimeUnixMs
            await State.update(
              {
                lastWasmBlockHeightExported: Sequelize.fn(
                  'GREATEST',
                  Sequelize.col('lastWasmBlockHeightExported'),
                  lastBlockHeightExported
                ),

                latestBlockHeight: Sequelize.fn(
                  'GREATEST',
                  Sequelize.col('latestBlockHeight'),
                  lastBlockHeightExported
                ),
                latestBlockTimeUnixMs: Sequelize.fn(
                  'GREATEST',
                  Sequelize.col('latestBlockTimeUnixMs'),
                  lastBlockTimeUnixMsExported
                ),
              },
              {
                where: {
                  singleton: true,
                },
              }
            )

            const uniqueContractAddresses = new Set(
              events.map((event) => event.contractAddress)
            )
            const contracts = Array.from(uniqueContractAddresses).map(
              (address) => {
                const event = events.find(
                  (event) => event.contractAddress === address
                )
                if (!event) {
                  throw new Error(
                    `Event not found for contract address: ${address}`
                  )
                }
                return event.contract
              }
            )

            // Update meilisearch indexes. This must happen after the state is
            // updated since it uses the latest block.
            await updateIndexesForContracts({
              contracts,
            })

            // Log.
            console.log(
              `[wasm] Exported: ${events.length.toLocaleString()}. Block: ${BigInt(
                lastBlockHeightExported
              ).toLocaleString()}. Transformed: ${transformations.length.toLocaleString()}. Webhooks Q'd: ${webhooksQueued.toLocaleString()}. Computations updated/destroyed: ${computationsUpdated.toLocaleString()}/${computationsDestroyed.toLocaleString()}.`
            )
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

  // Wait for update file to close.
  await new Promise((resolve) => fifoRs.on('close', resolve))

  console.log(`\n[${new Date().toISOString()}] Update file closed.`)

  // Exit.
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
  console.log('Shutting down after updates finish...')
})
