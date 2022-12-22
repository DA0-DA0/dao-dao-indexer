import { Op } from 'sequelize'

import { Contract, Event } from '../db/models'
import { getEnv } from './env'
import { Block, ComputationOutput, Formula } from './types'

export const compute = async (
  formula: Formula,
  targetContract: Contract,
  args: Record<string, any>,
  block: Block
): Promise<ComputationOutput> => {
  // Store the latest block that we've seen for all keys accessed. This is the
  // earliest this computation could have been made.
  let latestBlock: Block | undefined

  const updateLatestBlock = async (events: Event[]) => {
    if (events.length === 0) {
      return
    }

    const latestEvent = events.sort((a, b) => b.blockHeight - a.blockHeight)[0]

    // If latest is unset, or if we found a later block height, update.
    if (
      latestBlock === undefined ||
      latestEvent.blockHeight > latestBlock.height
    ) {
      latestBlock = latestEvent.block
    }
  }

  const dependentKeys = new Set<string>()
  const env = getEnv(
    targetContract.address,
    block,
    args,
    dependentKeys,
    updateLatestBlock
  )

  const value = await formula(env)

  return {
    block: latestBlock,
    value,
    dependentKeys: Array.from(dependentKeys),
  }
}

export const computeRange = async (
  formula: Formula,
  targetContract: Contract,
  args: Record<string, any>,
  blockStart: Block,
  blockEnd: Block
): Promise<ComputationOutput[]> => {
  // Dependent keys across all blocks.
  const allDependentKeys = new Set<string>()
  // All events for dependent keys. All events for a given key should be sorted
  // in descending order by block height relative to each other. All events do
  // not need to be sorted, but we pick the first event (or list of first events
  // for a map) based on the first matched key in the list, so the first key
  // within the block height constraints should be the correct one.
  let allEvents: Event[] = []

  const computeForBlockInRange = async (
    block: Block
  ): Promise<{
    latestBlock: Block | undefined
    value: any
    dependentKeys: string[]
  }> => {
    // Store the latest block that we've seen for all keys accessed. This is the
    // earliest this computation could have been made.
    let latestBlock: Block | undefined

    const updateLatestBlock = async (events: Event[]) => {
      if (events.length === 0) {
        return
      }

      const latestEvent = events.sort(
        (a, b) => b.blockHeight - a.blockHeight
      )[0]

      // If latest is unset, or if we found a later block, update.
      if (
        latestBlock === undefined ||
        latestEvent.blockHeight > latestBlock.height
      ) {
        latestBlock = latestEvent.block
      }
    }

    // Build cache from all events for dependent keys.
    const initialCache: Record<string, Event[] | null | undefined> = {}
    const { nonMapKeys, mapPrefixes } = Event.splitDependentKeys(
      Array.from(allDependentKeys)
    )
    for (const key of nonMapKeys) {
      const [contractAddress, eventKey] = key.split(':')
      // `allEvents` are sorted descending by block height with respect to any
      // given key, so we can find the first event for a given key that is
      // before or equal to the current block height.
      const matchingEvent = allEvents.find(
        (event) =>
          event.contractAddress === contractAddress &&
          event.key === eventKey &&
          event.blockHeight <= block.height
      )
      initialCache[key] = matchingEvent ? [matchingEvent] : null
    }
    for (const prefixKey of mapPrefixes) {
      const [contractAddress, eventKeyPrefix] = prefixKey.split(':')
      // Get the first matching event for each unique key in the map before or
      // equal to the current block height.
      const matchingEvents = allEvents.reduce((acc, event) => {
        // If event is after the current block, or if we've already found an
        // event for this key, skip.
        if (
          event.blockHeight > block.height ||
          event.key in acc ||
          event.contractAddress !== contractAddress ||
          !event.key.startsWith(eventKeyPrefix)
        ) {
          return acc
        }

        return {
          ...acc,
          [event.key]: event,
        }
      }, {} as Record<string, Event>)

      initialCache[prefixKey] = Object.values(matchingEvents)
    }

    // Add hook to env so that the getters update the latest block info and next
    // changed block height.
    const dependentKeys = new Set<string>()
    const env = getEnv(
      targetContract.address,
      block,
      args,
      dependentKeys,
      updateLatestBlock,
      initialCache
    )

    const value = await formula(env)

    return {
      latestBlock,
      value,
      dependentKeys: Array.from(dependentKeys),
    }
  }

  const results: ComputationOutput[] = []

  // Start at the beginning block and compute the value. Each computation will
  // return with its value and the next block that may change the result. We can
  // then start at that block and compute again. We repeat this until we reach
  // the end block.
  let nextPotentialBlock: Block | undefined = blockStart
  while (nextPotentialBlock && nextPotentialBlock.height <= blockEnd.height) {
    const currentBlock: Block = nextPotentialBlock
    const result = await computeForBlockInRange(currentBlock)

    const previousResult = results[results.length - 1]
    // Only store result if it's the first result or different from the most
    // recently stored result.
    if (!previousResult || result.value !== previousResult.value) {
      results.push({
        block: result.latestBlock,
        value: result.value,
        dependentKeys: result.dependentKeys,
      })
    }

    // Preload all events for new dependent keys seen until the end.
    const newDependentKeys = result.dependentKeys.filter(
      (key) => !allDependentKeys.has(key)
    )
    if (newDependentKeys.length > 0) {
      const futureEvents = await Event.findAll({
        where: {
          // After the current block up to the end block.
          blockHeight: {
            [Op.gt]: currentBlock.height,
            [Op.lte]: blockEnd.height,
          },
          ...Event.getWhereClauseForDependentKeys(newDependentKeys),
        },
        order: [['blockHeight', 'DESC']],
      })
      // Save for future computations.
      allEvents = allEvents.concat(futureEvents)
      newDependentKeys.forEach((key) => allDependentKeys.add(key))
    }

    // Find the next event that has the potential to change the result for the
    // given dependent keys. If it remains undefined, then we know that the
    // result will not change because no inputs changed.
    nextPotentialBlock = undefined

    const { nonMapKeys: nextNonMapKeys, mapPrefixes: nextMapPrefixes } =
      Event.splitDependentKeys(Array.from(result.dependentKeys))
    for (const key of nextNonMapKeys) {
      const [contractAddress, eventKey] = key.split(':')
      // `allEvents` are sorted descending by block height with respect to any
      // given key, so we can find the next event for a given key that is after
      // the current block height by selecting the last one found.
      const matchingEvent = allEvents
        .filter(
          (event) =>
            event.contractAddress === contractAddress &&
            event.key === eventKey &&
            event.blockHeight > currentBlock.height
        )
        .slice(-1)[0]

      if (
        matchingEvent &&
        (nextPotentialBlock === undefined ||
          matchingEvent.blockHeight < nextPotentialBlock.height)
      ) {
        nextPotentialBlock = matchingEvent.block
      }
    }
    for (const prefixKey of nextMapPrefixes) {
      const [contractAddress, eventKeyPrefix] = prefixKey.split(':')
      // Get the last matching event for each unique key in the map after the
      // current block height.
      const matchingEvents = allEvents.reduce(
        (acc, event) =>
          event.contractAddress === contractAddress &&
          event.key.startsWith(eventKeyPrefix) &&
          event.blockHeight > currentBlock.height
            ? {
                ...acc,
                [event.key]: event,
              }
            : acc,
        {} as Record<string, Event>
      )

      const nextEvent = Object.values(matchingEvents).sort(
        (a, b) => a.blockHeight - b.blockHeight
      )[0]
      if (
        nextEvent &&
        (nextPotentialBlock === undefined ||
          nextEvent.blockHeight < nextPotentialBlock.height)
      ) {
        nextPotentialBlock = nextEvent.block
      }
    }
  }

  return results
}
