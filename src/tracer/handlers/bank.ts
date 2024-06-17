import { fromBase64, fromUtf8, toBech32 } from '@cosmjs/encoding'
import { Coin } from '@dao-dao/types/protobuf/codegen/cosmos/base/v1beta1/coin'
import retry from 'async-await-retry'
import { Sequelize } from 'sequelize'

import {
  BankStateEvent,
  State,
  updateComputationValidityDependentOnChanges,
} from '@/db'
import { Handler, HandlerMaker, ParsedBankStateEvent } from '@/types'

const STORE_NAME = 'bank'

export const bank: HandlerMaker<ParsedBankStateEvent> = async ({
  config: { bech32Prefix },
  updateComputations,
}) => {
  const match: Handler<ParsedBankStateEvent>['match'] = (trace) => {
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
      address = toBech32(bech32Prefix, keyData.slice(2, 2 + length))
      denom = fromUtf8(keyData.slice(2 + length))
    } catch {
      // Ignore decoding errors.
      return
    }

    // Get code ID and block timestamp from chain.
    const blockHeight = BigInt(trace.metadata.blockHeight).toString()

    const blockTimeUnixMs = BigInt(trace.blockTimeUnixMs).toString()
    const blockTimestamp = new Date(trace.blockTimeUnixMs)

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
        const decodedValue = JSON.parse(fromUtf8(valueData))
        if (
          (typeof decodedValue === 'string' && /^[0-9]+$/.test(decodedValue)) ||
          typeof decodedValue === 'number'
        ) {
          balance =
            typeof decodedValue === 'number'
              ? BigInt(decodedValue).toString()
              : decodedValue
        }
      } catch {
        // Ignore decoding errors.
      }

      // Try to decode as legacy Coin protobuf, and ensure amount consists of
      // only numbers. Otherwise, ignore. The protobuf will decode (and not
      // error) if the value is another protobuf, but amount will likely contain
      // other data instead of a number. There's no way to ensure it's actually
      // a coin protobuf, so this is the best we can do.
      try {
        const { amount } = Coin.decode(valueData)
        if (/^[0-9]+$/.test(amount)) {
          balance = amount
        }
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

    return {
      id: [blockHeight, address, denom].join(':'),
      address,
      blockHeight,
      blockTimeUnixMs,
      blockTimestamp,
      denom,
      balance,
    }
  }

  const process: Handler<ParsedBankStateEvent>['process'] = async (events) => {
    const exportEvents = async () =>
      // Unique index on [blockHeight, address, denom] ensures that we don't
      // insert duplicate events. If we encounter a duplicate, we update the
      // `balance` field in case event processing for a block was batched
      // separately.
      events.length > 0
        ? await BankStateEvent.bulkCreate(events, {
            updateOnDuplicate: ['balance'],
          })
        : []

    // Retry 3 times with exponential backoff starting at 100ms delay.
    const exportedEvents = (await retry(exportEvents, [], {
      retriesMax: 3,
      exponential: true,
      interval: 100,
    })) as BankStateEvent[]

    if (updateComputations) {
      await updateComputationValidityDependentOnChanges(exportedEvents)
    }

    // Store last block height exported, and update latest block
    // height/time if the last export is newer.
    const lastBlockHeightExported =
      exportedEvents[exportedEvents.length - 1].blockHeight
    const lastBlockTimeUnixMsExported =
      exportedEvents[exportedEvents.length - 1].blockTimeUnixMs
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

    return exportedEvents
  }

  return {
    storeName: STORE_NAME,
    match,
    process,
  }
}
