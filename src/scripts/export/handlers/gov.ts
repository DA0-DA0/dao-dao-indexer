import { fromBase64, toBase64 } from '@cosmjs/encoding'
import retry from 'async-await-retry'
import { Sequelize } from 'sequelize'

import { ParsedGovStateEvent } from '@/core'
import {
  GovStateEvent,
  State,
  updateComputationValidityDependentOnChanges,
} from '@/db'
import { Proposal as ProposalV1 } from '@/protobuf/codegen/cosmos/gov/v1/gov'
import { Proposal as ProposalV1Beta1 } from '@/protobuf/codegen/cosmos/gov/v1beta1/gov'

import { Handler, HandlerMaker } from '../types'

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

    // Convert base64 value to utf-8 string, if present.
    let valueData
    try {
      valueData = trace.value && fromBase64(trace.value)
    } catch {
      return
    }

    // If failed to parse value, skip.
    if (!valueData) {
      return
    }

    // Attempt v1 decoding, falling back to v1beta1. If both fail, ignore.
    let data: any
    let version
    try {
      data = toBase64(ProposalV1.toProto(ProposalV1.decode(valueData)))
      version = 'v1'
    } catch {
      try {
        data = toBase64(
          ProposalV1Beta1.toProto(ProposalV1Beta1.decode(valueData))
        )
        version = 'v1beta1'
      } catch {
        return
      }
    }

    return {
      id: [blockHeight, proposalId].join(':'),
      proposalId,
      blockHeight,
      blockTimeUnixMs,
      blockTimestamp,
      version,
      data,
    }
  }

  const process: Handler<ParsedGovStateEvent>['process'] = async (events) => {
    const exportEvents = async () =>
      // Unique index on [blockHeight, proposalId] ensures that we don't insert
      // duplicate events. If we encounter a duplicate, we update the `version`
      // and `data` fields in case event processing for a block was batched
      // separately.
      events.length > 0
        ? await GovStateEvent.bulkCreate(events, {
            updateOnDuplicate: ['version', 'data'],
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
