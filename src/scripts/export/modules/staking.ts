import * as Sentry from '@sentry/node'
import { Sequelize } from 'sequelize'

import { objectMatchesStructure } from '@/core'
import { StakingSlashEvent, State, Validator } from '@/db'

import { ModuleExporter, ModuleExporterMaker } from '../types'

type IndexerStakingEvent = {
  type: 'slash'
  registeredBlockHeight: number
  registeredBlockTimeUnixMs: number
  infractionBlockHeight: number
  validatorOperator: string
  slashFactor: string
  amountSlashed: string
  effectiveFraction: string
  stakedTokensBurned: string
}

type ParsedStakingEvent = {
  type: 'slash'
  registeredBlockHeight: string
  registeredBlockTimeUnixMs: string
  registeredBlockTimestamp: Date
  infractionBlockHeight: string
  validatorOperatorAddress: string
  slashFactor: string
  amountSlashed: string
  effectiveFraction: string
  stakedTokensBurned: string
}

export const staking: ModuleExporterMaker = ({
  config,
  state,
  initialBlockHeight,
  batch,
}) => {
  const pending: IndexerStakingEvent[] = []

  const initialBlock =
    initialBlockHeight ??
    // Start at the next block after the last exported block if no initial block
    // set.
    BigInt(state.lastStakingBlockHeightExported ?? '0') + 1n

  console.log(
    `[staking] Catching up to initial block ${initialBlock.toLocaleString()}...`
  )

  let lastBlockHeightSeen = 0
  let catchingUp = true

  const flush = async () => {
    if (pending.length === 0) {
      return
    }

    const parsedEvents = pending.map((event): ParsedStakingEvent => {
      const registeredBlockTimestamp = new Date(event.registeredBlockTimeUnixMs)

      return {
        type: event.type,
        registeredBlockHeight: event.registeredBlockHeight.toString(),
        registeredBlockTimeUnixMs: event.registeredBlockTimeUnixMs.toString(),
        registeredBlockTimestamp,
        infractionBlockHeight: event.infractionBlockHeight.toString(),
        validatorOperatorAddress: event.validatorOperator,
        slashFactor: event.slashFactor,
        amountSlashed: event.amountSlashed,
        effectiveFraction: event.effectiveFraction,
        stakedTokensBurned: event.stakedTokensBurned,
      }
    })

    // Export events.
    const { lastBlockHeightExported } = await exporter(parsedEvents)

    // Log.
    console.log(
      `[staking] Exported: ${parsedEvents.length.toLocaleString()}. Latest block exported: ${lastBlockHeightExported.toLocaleString()}.`
    )

    // Clear queue.
    pending.length = 0
  }

  const handler: ModuleExporter['handler'] = async (line) => {
    let event: IndexerStakingEvent
    try {
      event = JSON.parse(line)

      // If event not of expected structure, skip.
      if (
        !objectMatchesStructure(event, {
          type: {},
        }) ||
        (event.type === 'slash' &&
          !objectMatchesStructure(event, {
            registeredBlockHeight: {},
            registeredBlockTimeUnixMs: {},
            infractionBlockHeight: {},
            validatorOperator: {},
            slashFactor: {},
            amountSlashed: {},
            effectiveFraction: {},
            stakedTokensBurned: {},
          }))
      ) {
        throw new Error('Invalid line structure.')
      }
    } catch (err) {
      // Capture error so we can investigate.
      Sentry.captureException(err, {
        tags: {
          module: 'staking',
        },
        extra: {
          line,
        },
      })

      // If event not valid JSON, skip.
      return
    }

    // If event is from a block before the initial block, skip.
    if (BigInt(event.registeredBlockHeight) < initialBlock) {
      lastBlockHeightSeen = event.registeredBlockHeight
      return
    } else if (catchingUp) {
      console.log(
        `[staking] Caught up to initial block ${initialBlock.toLocaleString()}.`
      )
      catchingUp = false
    }

    // If we have enough events and reached the first event of the next block,
    // flush the previous events to the DB. This ensures we batch all events
    // from the same block together.
    if (
      pending.length >= batch &&
      event.registeredBlockHeight > lastBlockHeightSeen
    ) {
      await flush()
    }

    pending.push(event)
    lastBlockHeightSeen = event.registeredBlockHeight
  }

  return {
    sourceFile: config.sources.staking,
    handler,
    flush,
  }
}

const exporter = async (
  parsedEvents: ParsedStakingEvent[]
): Promise<{
  lastBlockHeightExported: bigint
}> => {
  const uniqueValidators = [
    ...new Set(parsedEvents.map((event) => event.validatorOperatorAddress)),
  ]

  // Try to create validators up to 3 times. This has previously failed due to a
  // deadlock.
  let validatorCreationAttempts = 3
  while (validatorCreationAttempts > 0) {
    try {
      // Ensure validator exists before creating events. `operatorAddress` is
      // unique.
      await Validator.bulkCreate(
        uniqueValidators.map((operatorAddress) => ({
          operatorAddress,
        })),
        {
          // If already exists, ignore.
          ignoreDuplicates: true,
        }
      )

      // Break on success.
      break
    } catch (err) {
      console.error('staking', err)
      Sentry.captureException(err, {
        tags: {
          script: 'export',
          module: 'staking',
        },
        extra: {
          uniqueValidators,
        },
      })
      validatorCreationAttempts--

      // If we've tried all times, throw the error so we halt.
      if (validatorCreationAttempts === 0) {
        throw err
      }
    }
  }

  // Unique index ensures that we don't insert duplicate events.
  await StakingSlashEvent.bulkCreate(parsedEvents)

  // Store last block height exported.
  const lastBlockHeightExported =
    parsedEvents[parsedEvents.length - 1].registeredBlockHeight

  await State.update(
    {
      lastStakingBlockHeightExported: Sequelize.fn(
        'GREATEST',
        Sequelize.col('lastStakingBlockHeightExported'),
        lastBlockHeightExported
      ),
    },
    {
      where: {
        singleton: true,
      },
    }
  )

  return {
    lastBlockHeightExported: BigInt(lastBlockHeightExported),
  }
}
