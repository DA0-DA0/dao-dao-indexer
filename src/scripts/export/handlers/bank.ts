import { fromBase64, fromUtf8, toBech32 } from '@cosmjs/encoding'
import retry from 'async-await-retry'
import { Coin } from 'cosmjs-types/cosmos/base/v1beta1/coin'
import { Sequelize } from 'sequelize'

import { ParsedBankStateEvent } from '@/core'
import {
  BankStateEvent,
  State,
  updateComputationValidityDependentOnChanges,
} from '@/db'

import { Handler, HandlerMaker } from '../types'

const STORE_NAME = 'bank'
const MAX_BATCH_SIZE = 5000

export const bank: HandlerMaker = async ({
  config,
  dontUpdateComputations,
  getBlockTimeUnixMs,
}) => {
  const pending: ParsedBankStateEvent[] = []

  const flush = async () => {
    if (pending.length === 0) {
      return
    }

    // For state events with the same blockHeight, address, and denom, only keep
    // the last event. This is because the indexer guarantees that events are
    // emitted in order, and the last event is the most up-to-date. Multiple
    // events may occur if the value is updated multiple times across different
    // messages. The indexer can only maintain uniqueness within a message and
    // its submessages, but different messages in the same block can write to
    // the same key, and the indexer emits all the messages.
    const uniqueIndexerEvents = pending.reduce((acc, event) => {
      const key = event.blockHeight + event.address + event.denom
      acc[key] = event
      return acc
    }, {} as Record<string, ParsedBankStateEvent>)
    const eventsToExport = Object.values(uniqueIndexerEvents)

    // Clear queue.
    pending.length = 0

    // Export events.
    await exporter(eventsToExport)
  }

  let lastBlockHeightSeen = 0
  let debouncedFlush: NodeJS.Timeout | undefined

  const handle: Handler['handle'] = async (trace) => {
    // BalancesPrefix = 0x02
    // bank keys are formatted as:
    // BalancesPrefix || len(addressBytes) || addressBytes || denomBytes

    const keyData = fromBase64(trace.key)
    if (keyData[0] !== 0x02 || keyData.length < 3) {
      return
    }

    const length = keyData[1]

    let address
    let denom
    try {
      address = toBech32(config.bech32Prefix, keyData.slice(2, 2 + length))
      denom = fromUtf8(keyData.slice(2 + length))
    } catch {
      // Ignore decoding errors.
      return
    }

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

    // Mimics behavior of `UnmarshalBalanceCompat` in `x/bank/keeper/view.go` to
    // decode balance.

    let balance: string | undefined
    // If write operation, balance is updated. Otherwise (delete), balance is 0.
    if (trace.operation === 'write') {
      let valueData
      try {
        valueData = trace.value && fromBase64(trace.value)
      } catch {
        // Ignore decoding errors.
      }

      // If no data, ignore.
      if (!valueData) {
        return
      }

      // Try to decode as JSON-encoded number.
      try {
        balance = BigInt(JSON.parse(fromUtf8(valueData))).toString()
      } catch {
        // Ignore decoding errors.
      }

      // Try to decode as legacy Coin protobuf, and ensure amount can be parsed
      // as a bigint. Otherwise, ignore. The protobuf will decode (and not
      // error) if the value is another protobuf, but amount will likely contain
      // other data instead of a number. There's no way to ensure it's actually
      // a coin protobuf, so this is the best we can do.
      try {
        balance = BigInt(Coin.decode(valueData).amount).toString()
      } catch {
        // Ignore decoding errors.
      }
    } else if (trace.operation === 'delete') {
      balance = '0'
    }

    // If could not find balance, ignore.
    if (!balance) {
      return
    }

    pending.push({
      address,
      blockHeight,
      blockTimeUnixMs,
      blockTimestamp,
      denom,
      balance,
    })
    lastBlockHeightSeen = trace.metadata.blockHeight

    // Debounce flush in 200ms.
    if (debouncedFlush !== undefined) {
      clearTimeout(debouncedFlush)
    }

    // If batch size reached, flush immediately.
    if (pending.length >= MAX_BATCH_SIZE) {
      debouncedFlush = undefined
      await flush()
      return
    } else {
      debouncedFlush = setTimeout(flush, 200)
    }

    return
  }

  const exporter = async (parsedEvents: ParsedBankStateEvent[]) => {
    const start = Date.now()

    const exportEvents = async () =>
      // Unique index on [blockHeight, address, denom] ensures that we don't
      // insert duplicate events. If we encounter a duplicate, we update the
      // `balance` field in case event processing for a block was batched
      // separately.
      parsedEvents.length > 0
        ? await BankStateEvent.bulkCreate(parsedEvents, {
            updateOnDuplicate: ['balance'],
          })
        : []

    // Retry 3 times with exponential backoff starting at 100ms delay.
    const events = (await retry(exportEvents, [], {
      retriesMax: 3,
      exponential: true,
      interval: 100,
    })) as BankStateEvent[]

    let computationsUpdated = 0
    let computationsDestroyed = 0
    if (!dontUpdateComputations) {
      const computationUpdates =
        await updateComputationValidityDependentOnChanges(events)
      computationsUpdated = computationUpdates.updated
      computationsDestroyed = computationUpdates.destroyed
    }

    // Store last block height exported, and update latest block
    // height/time if the last export is newer.
    const lastBlockHeightExported = events[events.length - 1].blockHeight
    const lastBlockTimeUnixMsExported =
      events[events.length - 1].blockTimeUnixMs
    await State.update(
      {
        lastBankBlockHeightExported: Sequelize.fn(
          'GREATEST',
          Sequelize.col('lastBankBlockHeightExported'),
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

    const end = Date.now()
    const duration = end - start

    // Log.
    console.log(
      `[bank] Exported: ${events.length.toLocaleString()}. Block: ${BigInt(
        lastBlockHeightExported
      ).toLocaleString()}. Computations updated/destroyed: ${computationsUpdated.toLocaleString()}/${computationsDestroyed.toLocaleString()}. Duration: ${duration.toLocaleString()}ms.`
    )
  }

  return {
    storeName: STORE_NAME,
    handle,
    flush,
  }
}
