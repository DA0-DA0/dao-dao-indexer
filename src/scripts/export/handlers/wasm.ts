import { fromBase64, fromUtf8, toBech32 } from '@cosmjs/encoding'
import * as Sentry from '@sentry/node'
import retry from 'async-await-retry'
import { LRUCache } from 'lru-cache'
import { Sequelize } from 'sequelize'

import { ParsedWasmStateEvent } from '@/core'
import {
  AccountWebhook,
  Contract,
  State,
  WasmStateEvent,
  WasmStateEventTransformation,
} from '@/db'
import { updateIndexesForContracts } from '@/ms'
import { ContractInfo } from '@/protobuf/codegen/cosmwasm/wasm/v1/types'

import { Handler, HandlerMaker } from '../types'
import { queueWebhooks } from '../webhooks'

const STORE_NAME = 'wasm'
const CONTRACT_BYTE_LENGTH = 32

type WasmExportData =
  | {
      type: 'state'
      data: Omit<ParsedWasmStateEvent, 'blockTimestamp'>
    }
  | {
      type: 'contract'
      data: {
        address: string
        codeId: number
        blockHeight: string
        blockTimeUnixMs: string
      }
    }

export const wasm: HandlerMaker<WasmExportData> = async ({
  config: { bech32Prefix },
  // updateComputations,
  sendWebhooks,
  cosmWasmClient,
}) => {
  const chainId = await cosmWasmClient.getChainId()

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

  const match: Handler<WasmExportData>['match'] = (trace) => {
    // ContractStorePrefix = 0x03
    // wasm keys are formatted as:
    // ContractStorePrefix || contractAddressBytes || keyBytes

    // ContractKeyPrefix = 0x02
    // contract info keys are formatted as:
    // ContractKeyPrefix || contractAddressBytes

    const keyData = fromBase64(trace.key)
    if (keyData[0] !== 0x02 && keyData[0] !== 0x03) {
      return
    }

    // Ignore keys that are too short to be a wasm key. Needs at least one more
    // than the contract byte length for the prefix.
    if (keyData.length < CONTRACT_BYTE_LENGTH + 1) {
      return
    }

    const contractAddress = toBech32(
      bech32Prefix,
      keyData.slice(1, CONTRACT_BYTE_LENGTH + 1)
    )
    // Convert key to comma-separated list of bytes. See explanation in `Event`
    // model for more information.
    const key = keyData.slice(CONTRACT_BYTE_LENGTH + 1).join(',')

    // Get code ID and block timestamp from chain.
    const blockHeight = BigInt(trace.metadata.blockHeight).toString()
    const blockTimeUnixMs = BigInt(trace.blockTimeUnixMs).toString()

    // If contract key, save contract info.
    if (trace.operation === 'write' && keyData[0] === 0x02) {
      // Parse as protobuf to get code ID.
      const protobufContractInfo = fromBase64(trace.value)
      let contractInfo
      try {
        contractInfo = ContractInfo.decode(protobufContractInfo)
      } catch {
        // If failed to decode, not contract info.
        return
      }

      if (!contractInfo.codeId) {
        // If no code ID found in JSON, ignore.
        return
      }

      return {
        id: ['contract', blockHeight, contractAddress].join(':'),
        type: 'contract',
        data: {
          address: contractAddress,
          codeId: Number(contractInfo.codeId),
          blockHeight,
          blockTimeUnixMs,
        },
      }
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

    return {
      id: ['state', blockHeight, contractAddress, key].join(':'),
      type: 'state',
      data: {
        type: 'state',
        // Initialize the code ID to 0 since we don't know it yet. It will be
        // retrieved later.
        codeId: 0,
        contractAddress,
        blockHeight,
        blockTimeUnixMs,
        key,
        value,
        valueJson,
        delete: trace.operation === 'delete',
      },
    }
  }

  const process: Handler<WasmExportData>['process'] = async (events) => {
    // Export contracts.
    const contractEvents = events.flatMap((event) =>
      event.type === 'contract' ? event.data : []
    )
    if (contractEvents.length > 0) {
      await Contract.bulkCreate(
        contractEvents.map(
          ({ address, codeId, blockHeight, blockTimeUnixMs }) => ({
            address,
            codeId,
            instantiatedAtBlockHeight: blockHeight,
            instantiatedAtBlockTimeUnixMs: blockTimeUnixMs,
            instantiatedAtBlockTimestamp: new Date(Number(blockTimeUnixMs)),
          })
        ),
        {
          updateOnDuplicate: ['codeId'],
        }
      )
    }

    // Export state.
    let stateEvents = events
      .flatMap((event) => (event.type === 'state' ? event.data : []))
      .map(
        (e): ParsedWasmStateEvent => ({
          ...e,
          blockTimestamp: new Date(Number(e.blockTimeUnixMs)),
        })
      )
    if (!stateEvents.length) {
      return
    }

    const state = await State.getSingleton()
    if (!state) {
      throw new Error('State not found while exporting.')
    }

    const uniqueContracts = [
      ...new Set(stateEvents.map((stateEvent) => stateEvent.contractAddress)),
    ]

    const exportContractsAndEvents = async () => {
      // Ensure contract exists before creating events. `address` is unique.
      await Contract.bulkCreate(
        uniqueContracts.map((address) => {
          const event = stateEvents.find(
            (event) => event.contractAddress === address
          )
          // Should never happen since `uniqueContracts` is derived from
          // `parsedEvents`.
          if (!event) {
            throw new Error('Event not found when creating contract.')
          }

          return {
            address,
            // Initialize the code ID to 0 since we don't know it here. It will
            // be retrieved below if it doesn't already exist in the database.
            codeId: 0,
            // Set the contract instantiation block to the first event found in
            // the list of parsed events. Events are sorted in ascending order
            // by creation block. These won't get updated if the contract
            // already exists, so it's safe to always attempt creation with the
            // first event's block.
            instantiatedAtBlockHeight: event.blockHeight,
            instantiatedAtBlockTimeUnixMs: event.blockTimeUnixMs,
            instantiatedAtBlockTimestamp: new Date(
              Number(event.blockTimeUnixMs)
            ),
          }
        }),
        {
          // Do nothing if contract already exists.
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
      // the `value`, `valueJson`, and `delete` fields in case event processing
      // for a block was batched separately.
      const events = await WasmStateEvent.bulkCreate(stateEvents, {
        updateOnDuplicate: ['value', 'valueJson', 'delete'],
      })

      return {
        contracts,
        events,
      }
    }

    // Retry 3 times with exponential backoff starting at 100ms delay.
    let { contracts, events: exportedEvents } = (await retry(
      exportContractsAndEvents,
      [],
      {
        retriesMax: 3,
        exponential: true,
        interval: 100,
      }
    )) as {
      contracts: Contract[]
      events: WasmStateEvent[]
    }

    // Add contract to events.
    await Promise.all(
      exportedEvents.map(async (event) => {
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
    stateEvents.forEach((stateEvent) => {
      const contract = contracts.find(
        (contract) => contract.address === stateEvent.contractAddress
      )
      if (contract) {
        stateEvent.codeId = contract.codeId
      }
    })

    // Remove events that don't have a contract or code ID.
    exportedEvents = exportedEvents.filter(
      (event) => event.contract !== undefined
    )
    stateEvents = stateEvents.filter((stateEvent) => stateEvent.codeId > 0)

    // Transform events as needed.
    // Retry 3 times with exponential backoff starting at 100ms delay.
    const _transformations = (await retry(
      WasmStateEventTransformation.transformParsedStateEvents,
      [stateEvents],
      {
        retriesMax: 3,
        exponential: true,
        interval: 100,
      }
    )) as WasmStateEventTransformation[]

    // TODO(computations): Re-enable computations when they are invalidated in the background.
    // if (updateComputations) {
    //   await updateComputationValidityDependentOnChanges([
    //     ...exportedEvents,
    //     ...transformations,
    //   ])
    // }

    // Queue webhooks as needed.
    if (sendWebhooks && exportedEvents.length > 0) {
      await queueWebhooks(state, exportedEvents)
      await AccountWebhook.queueWebhooks(exportedEvents)
    }

    // Store last block height exported, and update latest block
    // height/time if the last export is newer.
    const lastBlockHeightExported =
      exportedEvents[exportedEvents.length - 1].blockHeight
    const lastBlockTimeUnixMsExported =
      exportedEvents[exportedEvents.length - 1].blockTimeUnixMs
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
  }

  return {
    storeName: STORE_NAME,
    match,
    process,
  }
}
