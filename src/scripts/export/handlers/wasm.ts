import { fromBase64, fromUtf8, toBech32 } from '@cosmjs/encoding'
import * as Sentry from '@sentry/node'
import retry from 'async-await-retry'
import { ContractInfo } from 'cosmjs-types/cosmwasm/wasm/v1/types'
import { LRUCache } from 'lru-cache'
import { Sequelize } from 'sequelize'

import { ParsedWasmStateEvent } from '@/core'
import {
  AccountWebhook,
  Contract,
  PendingWebhook,
  State,
  WasmStateEvent,
  WasmStateEventTransformation,
  updateComputationValidityDependentOnChanges,
} from '@/db'
import { updateIndexesForContracts } from '@/ms'

import { Handler, HandlerMaker, TracedEvent } from '../types'

const MAX_BATCH_SIZE = 5000
const CONTRACT_BYTE_LENGTH = 32

export const wasm: HandlerMaker = async ({
  cosmWasmClient,
  config,
  blockHeightToTimeCache,
  dontUpdateComputations,
  dontSendWebhooks,
}) => {
  const chainId = await cosmWasmClient.getChainId()
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

    // Clear queue.
    pending.length = 0

    // Export events.
    await exporter(eventsToExport)
  }

  let lastBlockHeightSeen = 0
  let debouncedFlush: NodeJS.Timeout | undefined

  const handle: Handler['handle'] = async (trace) => {
    // ContractStorePrefix = 0x03
    // wasm keys are formatted as:
    // ContractStorePrefix || contractAddressBytes || keyBytes

    // ContractKeyPrefix = 0x02
    // contract info keys are formatted as:
    // ContractKeyPrefix || contractAddressBytes

    const keyData = fromBase64(trace.key)
    if (keyData[0] !== 0x02 && keyData[0] !== 0x03) {
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

    // If we reached the first event of the next block, flush the previous
    // events to the DB. This ensures we batch all events from the same block
    // together.
    if (trace.metadata.blockHeight > lastBlockHeightSeen) {
      await flush()
    }

    // Get code ID and block timestamp from chain.
    const blockHeight = BigInt(trace.metadata.blockHeight).toString()
    const blockTimeUnixMsNum = await getBlockTimeUnixMs(
      trace.metadata.blockHeight,
      trace
    )
    const blockTimeUnixMs = BigInt(blockTimeUnixMsNum).toString()
    const blockTimestamp = new Date(blockTimeUnixMsNum)

    // If contract key, save contract info.
    if (trace.operation === 'write' && keyData[0] === 0x02) {
      // Parse as protobuf to get code ID.
      const protobufContractInfo = fromBase64(trace.value)
      let contractInfo
      try {
        contractInfo = ContractInfo.decode(protobufContractInfo)
      } catch {
        // If failed to decode, not contract info.
        return false
      }

      if (!contractInfo.codeId) {
        // If no code ID found in JSON, ignore.
        return false
      }

      const blockHeightFromContractInfo =
        contractInfo.created?.blockHeight.toInt()

      const codeId = contractInfo.codeId.toInt()
      const [contract, created] = await Contract.findOrCreate({
        where: {
          address: contractAddress,
        },
        defaults: {
          address: contractAddress,
          codeId,
          instantiatedAtBlockHeight:
            blockHeightFromContractInfo ?? Number(blockHeight),
          // If block height is from contract info, we don't have block time, so
          // just set to 0.
          instantiatedAtBlockTimeUnixMs:
            blockHeightFromContractInfo === undefined ? 0 : blockTimeUnixMs,
          // If block height is from contract info, we don't have block time, so
          // just set to 0.
          instantiatedAtBlockTimestamp:
            blockHeightFromContractInfo === undefined
              ? new Date(0)
              : blockTimestamp,
        },
      })
      // Update code ID if it's changed.
      if (!created && contract.codeId !== codeId) {
        await contract.update({
          codeId,
        })
      }

      return true
    }

    // Otherwise, save state event.

    // Convert base64 value to utf-8 string, if present.
    let value
    try {
      value = trace.value && fromUtf8(fromBase64(trace.value))
    } catch (err) {
      // Ignore decoding errors.
      value = trace.value
    }

    let valueJson = null
    if (trace.operation !== 'delete' && value) {
      try {
        valueJson = JSON.parse(value ?? 'null')
      } catch {
        // Ignore parsing errors.
      }
    }

    // TODO: Get code ID from contract KV store directly???
    const event: ParsedWasmStateEvent = {
      type: 'state',
      codeId: 0,
      contractAddress,
      blockHeight,
      blockTimeUnixMs,
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

    // Debounce flush in 200ms.
    if (debouncedFlush !== undefined) {
      clearTimeout(debouncedFlush)
    }

    // If batch size reached, flush immediately.
    if (pending.length >= MAX_BATCH_SIZE) {
      debouncedFlush = undefined
      await flush()
      return true
    } else {
      debouncedFlush = setTimeout(flush, 200)
    }

    return true
  }

  const exporter = async (parsedEvents: ParsedWasmStateEvent[]) => {
    const start = Date.now()

    const state = await State.getSingleton()
    if (!state) {
      throw new Error('State not found while exporting.')
    }

    const uniqueContracts = [
      ...new Set(parsedEvents.map((event) => event.contractAddress)),
    ]

    const exportContractsAndEvents = async () => {
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
            // Set the code ID to 0 since we don't know it yet.
            codeId: 0,
            // Set the contract instantiation block to the first event found
            // in the list of parsed events. Events are sorted in ascending
            // order by creation block. These won't get updated if the
            // contract already exists, so it's safe to always attempt
            // creation with the first event's block. Only `codeId` gets
            // updated below when a duplicate is found.
            instantiatedAtBlockHeight: event.blockHeight,
            instantiatedAtBlockTimeUnixMs: event.blockTimeUnixMs,
            instantiatedAtBlockTimestamp: event.blockTimestamp,
          }
        }),
        // Do nothing if contract already exists.
        {
          ignoreDuplicates: true,
        }
      )

      let contracts = await Contract.findAll({
        where: {
          address: uniqueContracts,
        },
      })

      // Try to retrieve code IDs for contracts with 0 or -1 code IDs.
      const contractsToGetCodeId = contracts.filter(
        (contract) => contract.codeId <= 0
      )
      // Update code IDs for contracts with missing code IDs.
      if (contractsToGetCodeId.length > 0) {
        const codeIds = await Promise.all(
          contractsToGetCodeId.map((contract) => getCodeId(contract.address))
        )

        await Contract.bulkCreate(
          contractsToGetCodeId
            .map((contract, index) => ({
              ...contract.toJSON(),
              codeId: codeIds[index],
            }))
            .filter(({ codeId }) => codeId > 0),
          {
            updateOnDuplicate: ['codeId'],
          }
        )

        // Get updated contracts.
        contracts = await Contract.findAll({
          where: {
            address: uniqueContracts,
          },
        })
      }

      // Unique index on [blockHeight, contractAddress, key] ensures that we
      // don't insert duplicate events. If we encounter a duplicate, we update
      // the `value`, `valueJson`, and `delete` fields in case event
      // processing for a block was batched separately.
      const events =
        parsedEvents.length > 0
          ? await WasmStateEvent.bulkCreate(parsedEvents, {
              updateOnDuplicate: ['value', 'valueJson', 'delete'],
            })
          : []

      return {
        contracts,
        events,
      }
    }

    // Retry 3 times with exponential backoff starting at 100ms delay.
    let { contracts, events } = (await retry(exportContractsAndEvents, [], {
      retriesMax: 3,
      exponential: true,
      interval: 100,
    })) as {
      contracts: Contract[]
      events: WasmStateEvent[]
    }

    // Add contract to events.
    await Promise.all(
      events.map(async (event) => {
        let contract = contracts.find(
          (contract) => contract.address === event.contractAddress
        )
        // Fetch contract if it wasn't found.
        let missingContract = false
        if (!contract) {
          contract = (await event.$get('contract')) ?? undefined
          missingContract = true
        }

        if (contract) {
          if (missingContract) {
            // Save for other events.
            contracts.push(contract)
          }

          event.contract = contract
        }
      })
    )

    // Add code ID to parsed events.
    parsedEvents.forEach((parsedEvent) => {
      const contract = contracts.find(
        (contract) => contract.address === parsedEvent.contractAddress
      )
      if (contract) {
        parsedEvent.codeId = contract.codeId
      }
    })

    // Remove events that don't have a contract or code ID.
    events = events.filter((event) => event.contract !== undefined)
    parsedEvents = parsedEvents.filter((event) => event.codeId > 0)

    // Transform events as needed.
    // Retry 3 times with exponential backoff starting at 100ms delay.
    const transformations = (await retry(
      WasmStateEventTransformation.transformParsedStateEvents,
      [parsedEvents],
      {
        retriesMax: 3,
        exponential: true,
        interval: 100,
      }
    )) as WasmStateEventTransformation[]

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
    const lastBlockHeightExported = events[events.length - 1].blockHeight
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

    // Update meilisearch indexes. This must happen after the state is
    // updated since it uses the latest block.
    await updateIndexesForContracts({
      contracts,
    })

    const end = Date.now()
    const duration = end - start

    // Log.
    console.log(
      `[wasm] Exported: ${events.length.toLocaleString()}. Block: ${BigInt(
        lastBlockHeightExported
      ).toLocaleString()}. Transformed: ${transformations.length.toLocaleString()}. Webhooks: ${webhooksQueued.toLocaleString()}. Computations updated/destroyed: ${computationsUpdated.toLocaleString()}/${computationsDestroyed.toLocaleString()}. Duration: ${duration.toLocaleString()}ms.`
    )
  }

  // Get code ID for contract, cached in memory.
  const codeIdCache = new LRUCache<string, number>({
    max: 1000,
  })
  const getCodeId = async (contractAddress: string): Promise<number> => {
    if (codeIdCache.has(contractAddress)) {
      return codeIdCache.get(contractAddress) ?? 0
    }

    const loadIntoCache = async () => {
      let codeId = 0
      try {
        const contract = await cosmWasmClient.getContract(contractAddress)
        codeId = contract.codeId
      } catch (err) {
        // If contract not found, ignore, leaving as 0. Otherwise, throw err.
        if (
          !(err instanceof Error) ||
          !err.message.includes('not found: invalid request')
        ) {
          throw err
        }
      }

      codeIdCache.set(contractAddress, codeId)
    }

    try {
      // Retry 3 times with exponential backoff starting at 100ms delay.
      await retry(loadIntoCache, [], {
        retriesMax: 3,
        exponential: true,
        interval: 100,
      })
    } catch (err) {
      console.error(
        '-------\nFailed to get code ID:\n',
        err instanceof Error ? err.message : err,
        '\nContract: ' + contractAddress + '\n-------'
      )
      Sentry.captureException(err, {
        tags: {
          type: 'failed-get-code-id',
          script: 'export',
          handler: 'wasm',
          chainId,
          contractAddress,
        },
      })

      // Set to 0 on failure so we can continue.
      codeIdCache.set(contractAddress, 0)
    }

    return codeIdCache.get(contractAddress) ?? 0
  }

  // Get block time for height, cached in memory.
  const getBlockTimeUnixMs = async (
    blockHeight: number,
    trace: TracedEvent
  ): Promise<number> => {
    if (blockHeightToTimeCache.has(blockHeight)) {
      return blockHeightToTimeCache.get(blockHeight) ?? 0
    }

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
          handler: 'wasm',
          chainId,
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

  return {
    handle,
    flush,
  }
}
