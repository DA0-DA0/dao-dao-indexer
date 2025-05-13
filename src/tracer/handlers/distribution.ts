import { fromBase64 } from '@cosmjs/encoding'
import { DecCoin } from '@dao-dao/types/protobuf/codegen/cosmos/base/v1beta1/coin'
import { FeePool } from '@dao-dao/types/protobuf/codegen/cosmos/distribution/v1beta1/distribution'
import retry from 'async-await-retry'
import { Sequelize } from 'sequelize'

import {
  DistributionCommunityPoolStateEvent,
  State,
  updateComputationValidityDependentOnChanges,
} from '@/db'
import {
  Handler,
  HandlerMaker,
  ParsedDistributionCommunityPoolStateEvent,
} from '@/types'

const STORE_NAME = 'distribution'

export const distribution: HandlerMaker<
  ParsedDistributionCommunityPoolStateEvent
> = async ({ updateComputations }) => {
  const match: Handler<ParsedDistributionCommunityPoolStateEvent>['match'] = (
    trace
  ) => {
    // If write operation, parse coins. Otherwise, ignore.
    if (trace.operation !== 'write') {
      return
    }

    // FeePoolKey = 0x00
    const keyData = fromBase64(trace.key)
    if (keyData.length !== 1 || keyData[0] !== 0x00) {
      return
    }

    // Get code ID and block timestamp from chain.
    const blockHeight = BigInt(trace.metadata.blockHeight).toString()

    const blockTimeUnixMs = BigInt(trace.blockTimeUnixMs).toString()
    const blockTimestamp = new Date(trace.blockTimeUnixMs)

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

    // Try to decode fee pool and get community pool.
    let communityPool: DecCoin[]
    try {
      communityPool = FeePool.decode(valueData).communityPool
    } catch {
      // Ignore decoding errors.
      return
    }

    // Convert to map.
    const balances = Object.fromEntries(
      new Map(communityPool.map(({ denom, amount }) => [denom, amount]))
    )

    return {
      id: blockHeight,
      blockHeight,
      blockTimeUnixMs,
      blockTimestamp,
      balances,
    }
  }

  const process: Handler<ParsedDistributionCommunityPoolStateEvent>['process'] =
    async (events) => {
      const exportEvents = async () =>
        // Unique index on [blockHeight] ensures that we don't insert duplicate
        // events. If we encounter a duplicate, we update the `balances` field
        // in case event processing for a block was batched separately.
        events.length > 0
          ? await DistributionCommunityPoolStateEvent.bulkCreate(events, {
              updateOnDuplicate: ['balances'],
            })
          : []

      // Retry 3 times with exponential backoff starting at 100ms delay.
      const exportedEvents = (await retry(exportEvents, [], {
        retriesMax: 3,
        exponential: true,
        interval: 100,
      })) as DistributionCommunityPoolStateEvent[]

      if (updateComputations) {
        await updateComputationValidityDependentOnChanges(exportedEvents)
      }

      // Store last block height exported, and update latest block
      // height/time if the last export is newer.
      const lastBlockHeightExported =
        exportedEvents[exportedEvents.length - 1].blockHeight
      const lastBlockTimeUnixMsExported =
        exportedEvents[exportedEvents.length - 1].blockTimeUnixMs
      await State.updateSingleton({
        lastDistributionBlockHeightExported: Sequelize.fn(
          'GREATEST',
          Sequelize.col('lastDistributionBlockHeightExported'),
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
      })

      return exportedEvents
    }

  return {
    storeName: STORE_NAME,
    match,
    process,
  }
}
