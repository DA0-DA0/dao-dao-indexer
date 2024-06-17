import { fromBase64 } from '@cosmjs/encoding'
import retry from 'async-await-retry'
import { Sequelize } from 'sequelize'

import {
  GovStateEvent,
  State,
  updateComputationValidityDependentOnChanges,
} from '@/db'
import { Handler, HandlerMaker, ParsedGovStateEvent } from '@/types'

const STORE_NAME = 'gov'

export const gov: HandlerMaker<ParsedGovStateEvent> = async ({
  updateComputations,
}) => {
  const match: Handler<ParsedGovStateEvent>['match'] = (trace) => {
    // ProposalsKeyPrefix = 0x00
    // gov keys are formatted as:
    // ProposalsKeyPrefix || proposalIdBytes

    // Not sure why a proposal would ever be deleted...
    if (trace.operation === 'delete') {
      return
    }

    const keyData = fromBase64(trace.key)
    if (keyData[0] !== 0x00 || keyData.length !== 9) {
      return
    }

    let proposalId
    try {
      proposalId = Buffer.from(keyData.slice(1)).readBigUInt64BE().toString()
    } catch {
      // Ignore decoding errors.
      return
    }

    // Get code ID and block timestamp from chain.
    const blockHeight = BigInt(trace.metadata.blockHeight).toString()

    const blockTimeUnixMs = BigInt(trace.blockTimeUnixMs).toString()
    const blockTimestamp = new Date(trace.blockTimeUnixMs)

    // If no value, ignore.
    if (!trace.value) {
      return
    }

    return {
      id: [blockHeight, proposalId].join(':'),
      proposalId,
      blockHeight,
      blockTimeUnixMs,
      blockTimestamp,
      data: trace.value,
    }
  }

  const process: Handler<ParsedGovStateEvent>['process'] = async (events) => {
    const exportEvents = async () =>
      // Unique index on [blockHeight, proposalId] ensures that we don't insert
      // duplicate events. If we encounter a duplicate, we update the `data`
      // field in case event processing for a block was batched separately.
      events.length > 0
        ? await GovStateEvent.bulkCreate(events, {
            updateOnDuplicate: ['data'],
          })
        : []

    // Retry 3 times with exponential backoff starting at 100ms delay.
    const exportedEvents = (await retry(exportEvents, [], {
      retriesMax: 3,
      exponential: true,
      interval: 100,
    })) as GovStateEvent[]

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
        lastGovBlockHeightExported: Sequelize.fn(
          'GREATEST',
          Sequelize.col('lastGovBlockHeightExported'),
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
