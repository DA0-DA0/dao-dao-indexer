import * as Sentry from '@sentry/node'
import { Sequelize } from 'sequelize'

import {
  ParsedWasmEvent,
  ParsedWasmStateEvent,
  ParsedWasmTxEvent,
  base64KeyToEventKey,
  objectMatchesStructure,
} from '@/core'
import {
  AccountWebhook,
  Contract,
  PendingWebhook,
  State,
  WasmStateEvent,
  WasmStateEventTransformation,
  WasmTxEvent,
  updateComputationValidityDependentOnChanges,
} from '@/db'
import { updateIndexesForContracts } from '@/ms'

import { ModuleExporter, ModuleExporterMaker } from '../types'

type IndexerWasmEvent =
  | {
      type: 'state'
      blockHeight: number
      blockTimeUnixMs: number
      contractAddress: string
      codeId: number
      key: string
      value: string
      delete: boolean
    }
  | {
      type: 'tx'
      blockHeight: number
      blockTimeUnixMs: number
      txIndex: number
      messageId: string
      contractAddress: string
      codeId: number
      action: string
      sender: string
      msg: string
      reply: any | null
      funds: object
      response: any | null
      gasUsed: string
    }

export const wasm: ModuleExporterMaker = ({
  config,
  state,
  initialBlockHeight,
  batch,
  updateComputations,
  sendWebhooks,
}) => {
  const pending: IndexerWasmEvent[] = []

  const initialBlock =
    initialBlockHeight ??
    // Start at the next block after the last exported block if no initial block
    // set.
    BigInt(state.lastWasmBlockHeightExported ?? '0') + 1n

  console.log(
    `[wasm] Catching up to initial block ${initialBlock.toLocaleString()}...`
  )

  let lastBlockHeightSeen = 0
  let catchingUp = true

  const flush = async () => {
    if (pending.length === 0) {
      return
    }

    // For state events with the same blockHeight, contractAddress, and key,
    // only keep the last event. This is because the indexer guarantees that
    // events are emitted in order, and the last event is the most up-to-date.
    // Multiple events may occur if the value is updated multiple times across
    // different messages. The indexer can only maintain uniqueness within a
    // message and its submessages, but different messages in the same block can
    // write to the same key, and the indexer emits all the messages. For tx
    // events, all events should be unique, so just use a unique key which
    // should get all of them.
    const uniqueIndexerEvents = pending.reduce((acc, event) => {
      const key =
        event.type === 'state'
          ? event.blockHeight + event.contractAddress + event.key
          : event.blockHeight + event.txIndex.toString() + event.messageId
      acc[key] = event
      return acc
    }, {} as Record<string, IndexerWasmEvent>)
    const eventsToExport = Object.values(uniqueIndexerEvents)

    const parsedEvents = eventsToExport.map((event): ParsedWasmEvent => {
      if (event.type === 'state') {
        // Convert base64 value to utf-8 string, if present.
        const value =
          event.value && Buffer.from(event.value, 'base64').toString('utf-8')

        let valueJson = null
        if (!event.delete && value) {
          try {
            valueJson = JSON.parse(value ?? 'null')
          } catch {
            // Ignore parsing errors.
          }
        }

        const blockTimestamp = new Date(event.blockTimeUnixMs)

        return {
          type: 'state',
          codeId: event.codeId,
          contractAddress: event.contractAddress,
          blockHeight: event.blockHeight.toString(),
          blockTimeUnixMs: event.blockTimeUnixMs.toString(),
          blockTimestamp,
          // Convert base64 key to comma-separated list of bytes. See
          // explanation in `Event` model for more information.
          key: base64KeyToEventKey(event.key),
          value,
          valueJson,
          delete: event.delete,
        }
      } else if (event.type === 'tx') {
        // Convert base64 msg to utf-8 string, if present.
        const msg =
          event.msg && Buffer.from(event.msg, 'base64').toString('utf-8')

        let msgJson = null
        if (msg) {
          try {
            msgJson = JSON.parse(msg ?? 'null')
          } catch {
            // Ignore parsing errors.
          }
        }

        const blockTimestamp = new Date(event.blockTimeUnixMs)

        return {
          type: 'tx',
          blockHeight: event.blockHeight.toString(),
          blockTimeUnixMs: event.blockTimeUnixMs.toString(),
          blockTimestamp,
          txIndex: event.txIndex,
          messageId: event.messageId,
          contractAddress: event.contractAddress,
          codeId: event.codeId,
          action: event.action,
          sender: event.sender,
          msg,
          msgJson,
          reply: event.reply,
          funds: event.funds,
          response: event.response,
          gasUsed: event.gasUsed,
        }
      } else {
        throw new Error(
          `Unexpected event type for event: ${JSON.stringify(event)}`
        )
      }
    })

    // Export events.
    const {
      computationsUpdated,
      computationsDestroyed,
      transformations,
      webhooksQueued,
      lastBlockHeightExported,
    } = await exporter(parsedEvents, !updateComputations, !sendWebhooks)

    // Log.
    console.log(
      `[wasm] Exported: ${parsedEvents.length.toLocaleString()}. Latest block exported: ${lastBlockHeightExported.toLocaleString()}. Transformed: ${transformations.toLocaleString()}. Webhooks queued: ${webhooksQueued.toLocaleString()}. Computations updated/destroyed: ${computationsUpdated.toLocaleString()}/${computationsDestroyed.toLocaleString()}.`
    )

    // Clear queue.
    pending.length = 0
  }

  const handler: ModuleExporter['handler'] = async (line) => {
    let event: IndexerWasmEvent
    try {
      event = JSON.parse(line)

      // If event not of expected structure, skip.
      if (
        ((('type' in event && event.type === 'state') || !event.type) &&
          !objectMatchesStructure(
            event,
            {
              blockHeight: {},
              blockTimeUnixMs: {},
              contractAddress: {},
              codeId: {},
              key: {},
              value: {},
              delete: {},
            },
            {
              ignoreNullUndefined: true,
            }
          )) ||
        ('type' in event &&
          event.type === 'tx' &&
          !objectMatchesStructure(
            event,
            {
              blockHeight: {},
              blockTimeUnixMs: {},
              txIndex: {},
              messageId: {},
              contractAddress: {},
              codeId: {},
              action: {},
              sender: {},
              msg: {},
              reply: {},
              funds: {},
              response: {},
              gasUsed: {},
            },
            {
              ignoreNullUndefined: true,
            }
          )) ||
        ('type' in event && event.type !== 'tx' && event.type !== 'state')
      ) {
        throw new Error('Invalid line structure.')
      }
    } catch (err) {
      console.error(err)

      // Capture error so we can investigate.
      Sentry.captureException(err, {
        tags: {
          module: 'wasm',
        },
        extra: {
          line,
        },
      })

      // If event not valid JSON, skip.
      return
    }

    // If event is from a block before the initial block, skip.
    if (BigInt(event.blockHeight) < initialBlock) {
      lastBlockHeightSeen = event.blockHeight
      return
    } else if (catchingUp) {
      console.log(
        `[wasm] Caught up to initial block ${initialBlock.toLocaleString()}.`
      )
      catchingUp = false
    }

    // If we have enough events and reached the first event of the next block,
    // flush the previous events to the DB. This ensures we batch all events
    // from the same block together.
    if (pending.length >= batch && event.blockHeight > lastBlockHeightSeen) {
      await flush()
    }

    pending.push(event)
    lastBlockHeightSeen = event.blockHeight
  }

  return {
    sourceFile: config.sources.wasm,
    handler,
    flush,
  }
}

// TODO: Create pipeline architecture, handle errors better, etc.
const exporter = async (
  parsedEvents: ParsedWasmEvent[],
  dontUpdateComputations = false,
  dontSendWebhooks = false
): Promise<{
  computationsUpdated: number
  computationsDestroyed: number
  transformations: number
  webhooksQueued: number
  lastBlockHeightExported: bigint
}> => {
  const state = await State.getSingleton()
  if (!state) {
    throw new Error('State not found while exporting')
  }

  const uniqueContracts = [
    ...new Set(parsedEvents.map((event) => event.contractAddress)),
  ]

  // Try to create contracts up to 3 times. This has previously failed due to a
  // deadlock.
  let contractCreationAttempts = 3
  while (contractCreationAttempts > 0) {
    try {
      // Ensure contract exists before creating events. `address` is unique.
      await Contract.bulkCreate(
        uniqueContracts.map((address) => {
          const event = parsedEvents.find(
            (event) => event.contractAddress === address
          )
          // Should never happen since `uniqueContracts` is derived from
          // `parsedEvents`.
          if (!event) {
            throw new Error('Event not found when creating contract.')
          }

          return {
            address,
            codeId: event.codeId,
            // Set the contract instantiation block to the first event found in
            // the list of parsed events. Events are sorted in ascending order
            // by creation block. These won't get updated if the contract
            // already exists, so it's safe to always attempt creation with the
            // first event's block. Only `codeId` gets updated below when a
            // duplicate is found.
            instantiatedAtBlockHeight: event.blockHeight,
            instantiatedAtBlockTimeUnixMs: event.blockTimeUnixMs,
            instantiatedAtBlockTimestamp: event.blockTimestamp,
          }
        }),
        // When contract is migrated, codeId changes.
        {
          updateOnDuplicate: ['codeId'],
        }
      )

      // Break on success.
      break
    } catch (err) {
      console.error('wasm', err)
      Sentry.captureException(err, {
        tags: {
          script: 'export',
          module: 'wasm',
        },
        extra: {
          uniqueContracts,
        },
      })
      contractCreationAttempts--

      // If we've tried all times, throw the error so we halt.
      if (contractCreationAttempts === 0) {
        throw err
      }
    }
  }

  // Get updated contracts.
  const contracts = await Contract.findAll({
    where: {
      address: uniqueContracts,
    },
  })

  const parsedStateEvents = parsedEvents.filter(
    (event): event is ParsedWasmStateEvent => event.type === 'state'
  )
  const parsedTxEvents = parsedEvents.filter(
    (event): event is ParsedWasmTxEvent => event.type === 'tx'
  )

  // Unique index on [blockHeight, contractAddress, key] ensures that we don't
  // insert duplicate events. If we encounter a duplicate, we update the
  // `value`, `valueJson`, and `delete` fields in case event processing for a
  // block was batched separately.
  const exportedEvents = [
    ...(parsedStateEvents.length > 0
      ? await WasmStateEvent.bulkCreate(parsedStateEvents, {
          updateOnDuplicate: ['value', 'valueJson', 'delete'],
        })
      : []),
    ...(parsedTxEvents.length > 0
      ? await WasmTxEvent.bulkCreate(parsedTxEvents, {
          updateOnDuplicate: [
            'contractAddress',
            'action',
            'sender',
            'msg',
            'msgJson',
            'reply',
            'funds',
            'response',
            'gasUsed',
          ],
        })
      : []),
  ]
  // Add contracts to events since webhooks need to access contract code IDs.
  exportedEvents.forEach((event) => {
    event.contract = contracts.find(
      (contract) => contract.address === event.contractAddress
    )!
  })

  // Transform events as needed.
  const transformations =
    await WasmStateEventTransformation.transformParsedStateEvents(
      parsedStateEvents
    )

  let computationsUpdated = 0
  let computationsDestroyed = 0
  if (!dontUpdateComputations) {
    const computationUpdates =
      await updateComputationValidityDependentOnChanges([
        ...exportedEvents,
        ...transformations,
      ])
    computationsUpdated = computationUpdates.updated
    computationsDestroyed = computationUpdates.destroyed
  }

  const exportedStateEvents = exportedEvents.filter(
    (e): e is WasmStateEvent => e instanceof WasmStateEvent
  )
  // Queue webhooks as needed.
  const webhooksQueued =
    dontSendWebhooks || exportedStateEvents.length === 0
      ? 0
      : (await PendingWebhook.queueWebhooks(state, exportedStateEvents)) +
        (await AccountWebhook.queueWebhooks(exportedStateEvents))

  // Store last block height exported, and update latest block height/time if
  // the last export is newer.
  const lastBlockHeightExported =
    parsedEvents[parsedEvents.length - 1].blockHeight
  const lastBlockTimeUnixMsExported =
    parsedEvents[parsedEvents.length - 1].blockTimeUnixMs
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

  // Update meilisearch indexes. This must happen after the state is updated
  // since it uses the latest block.
  await updateIndexesForContracts({
    contracts,
  })

  return {
    computationsUpdated,
    computationsDestroyed,
    transformations: transformations.length,
    lastBlockHeightExported: BigInt(lastBlockHeightExported),
    webhooksQueued,
  }
}
