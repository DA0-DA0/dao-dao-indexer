import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import { fromBase64, fromUtf8, toBech32 } from '@cosmjs/encoding'
import * as Sentry from '@sentry/node'
import { Sequelize } from 'sequelize'

import {
  ParsedWasmEvent,
  ParsedWasmStateEvent,
  ParsedWasmTxEvent,
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

import { Handler, HandlerMaker } from '../types'

const CONTRACT_BYTE_LENGTH = 32

export const wasm: HandlerMaker = ({
  cosmWasmClient,
  altCosmWasmClient,
  config,
  batch,
  updateComputations,
  sendWebhooks,
}) => {
  const pending: ParsedWasmStateEvent[] = []

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
      const key = event.blockHeight + event.contractAddress + event.key
      acc[key] = event
      return acc
    }, {} as Record<string, ParsedWasmStateEvent>)
    const eventsToExport = Object.values(uniqueIndexerEvents)

    console.log('[wasm] Exporting...')

    // Export events.
    const {
      computationsUpdated,
      computationsDestroyed,
      transformations,
      webhooksQueued,
      lastBlockHeightExported,
    } = await exporter(eventsToExport, !updateComputations, !sendWebhooks)

    // Log.
    console.log(
      `[wasm] Exported: ${eventsToExport.length.toLocaleString()}. Latest block exported: ${lastBlockHeightExported.toLocaleString()}. Transformed: ${transformations.toLocaleString()}. Webhooks queued: ${webhooksQueued.toLocaleString()}. Computations updated/destroyed: ${computationsUpdated.toLocaleString()}/${computationsDestroyed.toLocaleString()}.`
    )

    // Clear queue.
    pending.length = 0
  }

  let lastBlockHeightSeen = 0

  const handle: Handler['handle'] = async (trace) => {
    // ContractStorePrefix = 0x03
    // wasm keys are formatted as:
    // ContractStorePrefix || contractAddressBytes || keyBytes

    const keyData = fromBase64(trace.key)
    if (keyData[0] !== 0x03) {
      return false
    }

    // Ignore keys that are too short to be a wasm key. Needs at least one more
    // than the contract byte length for the prefix.
    if (keyData.length < CONTRACT_BYTE_LENGTH + 1) {
      return false
    }

    const contractAddress = toBech32(
      config.bech32Prefix,
      keyData.slice(1, CONTRACT_BYTE_LENGTH + 1)
    )
    const key = keyData.slice(CONTRACT_BYTE_LENGTH + 1)

    // If we have enough events and reached the first event of the next block,
    // flush the previous events to the DB. This ensures we batch all events
    // from the same block together.
    if (
      pending.length >= batch &&
      trace.metadata.blockHeight > lastBlockHeightSeen
    ) {
      await flush()
    }

    // Convert base64 value to utf-8 string, if present.
    const value = trace.value && fromUtf8(fromBase64(trace.value))

    let valueJson = null
    if (trace.operation !== 'delete' && value) {
      try {
        valueJson = JSON.parse(value ?? 'null')
      } catch {
        // Ignore parsing errors.
      }
    }

    // Get code ID and block timestamp from chain.
    const codeId = await getCodeId(
      cosmWasmClient,
      altCosmWasmClient,
      contractAddress
    )
    const blockTimeUnixMs = await getBlockTimeUnixMs(
      cosmWasmClient,
      altCosmWasmClient,
      trace.metadata.blockHeight
    )
    const blockTimestamp = new Date(blockTimeUnixMs)

    const event: ParsedWasmStateEvent = {
      type: 'state',
      codeId,
      contractAddress,
      blockHeight: BigInt(trace.metadata.blockHeight).toString(),
      blockTimeUnixMs: BigInt(blockTimeUnixMs).toString(),
      blockTimestamp,
      // Convert key to comma-separated list of bytes. See explanation in
      // `Event` model for more information.
      key: key.join(','),
      value,
      valueJson,
      delete: trace.operation === 'delete',
    }

    pending.push(event)
    lastBlockHeightSeen = trace.metadata.blockHeight

    return true
  }

  return {
    handle,
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

// Get code ID for contract, cached in memory.
let codeIds: Record<string, number> = {}
const getCodeId = async (
  cosmWasmClient: CosmWasmClient,
  altCosmWasmClient: CosmWasmClient,
  contractAddress: string
): Promise<number> => {
  if (codeIds[contractAddress]) {
    return codeIds[contractAddress]
  }

  try {
    const { codeId } = await cosmWasmClient.getContract(contractAddress)
    codeIds[contractAddress] = codeId
  } catch (err) {
    // If failed, use alt client to get code ID.
    try {
      const { codeId } = await altCosmWasmClient.getContract(contractAddress)
      codeIds[contractAddress] = codeId
    } catch (err) {
      console.error(`Failed to get code ID for ${contractAddress}`, err)
      // If failed to get code ID, set to 0.
      codeIds[contractAddress] = 0
    }
  }

  return codeIds[contractAddress]
}

// Get block time for block, cached in memory.
let blockTimes: Record<number, number> = {}
const getBlockTimeUnixMs = async (
  cosmWasmClient: CosmWasmClient,
  altCosmWasmClient: CosmWasmClient,
  blockHeight: number
): Promise<number> => {
  if (blockTimes[blockHeight]) {
    return blockTimes[blockHeight]
  }

  try {
    const {
      header: { time },
    } = await cosmWasmClient.getBlock(blockHeight)

    blockTimes[blockHeight] = Date.parse(time)
    return blockTimes[blockHeight]
  } catch {
    // If failed, use alt client to get block time.
    const {
      header: { time },
    } = await altCosmWasmClient.getBlock(blockHeight)

    blockTimes[blockHeight] = Date.parse(time)
    return blockTimes[blockHeight]
  }
}
