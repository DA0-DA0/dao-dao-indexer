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
  // Store the latest block that we've seen for all keys accessed. This is when
  // this computation became valid, i.e. the earliest this computation could
  // have been made to get this output.
  let latestBlock: Block | undefined

  const onFetchEvents = async (events: Event[]) => {
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
    onFetchEvents
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
  // Dependent keys seen so far.
  const allDependentKeys = new Set<string>()
  // All events for contractAddress:key pairs, sorted ascending by block height.
  // These keys are different from dependent keys because dependent keys can
  // include map prefixes. We need to store all events for each key so we can
  // find the first event for a given key based on dynamic block height
  // constraints. Map contents may change based on many different keys, so maps
  // need to be reconstructed by individual key comparisons, meaning we need to
  // store keys separately here and not combined into their maps.
  const allEventsByContractAndKey: Record<string, Event[] | undefined> = {}

  const computeForBlockInRange = async (
    block: Block
  ): Promise<{
    latestBlock: Block | undefined
    value: any
    dependentKeys: string[]
    eventsUsed: Event[]
  }> => {
    // Store the latest block that we've seen for all keys accessed. This is the
    // earliest this computation could have been made.
    let latestBlock: Block | undefined

    // Store the events used for this computation.
    let eventsUsed: Event[] = []

    const onFetchEvents = async (events: Event[]) => {
      if (events.length === 0) {
        return
      }

      eventsUsed = [...eventsUsed, ...events]

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
      const allEvents = allEventsByContractAndKey[key]
      // No events found for this key, cache null to indicate it doesn't exist
      // and prevent querying for it.
      if (!allEvents) {
        initialCache[key] = null
        continue
      }

      // Sorted ascending by block height, so we can find the latest event for a
      // given key that is before or at the current block height by finding the
      // index of the first event that is after the current block height and
      // subtracting 1.
      const nextEventIndex = allEvents.findIndex(
        (event) => event.blockHeight > block.height
      )

      const currentEventIndex =
        // If the next event index is undefined or is the first event, there is
        // no current event.
        nextEventIndex === undefined || nextEventIndex === 0
          ? undefined
          : // If the next event index is greater than 0, the current event is the
          // most recent event before this one, so subtract one.
          nextEventIndex > 0
          ? nextEventIndex - 1
          : // If the next event index is -1, meaning no events matched the predicate, and events exist, the current event is the last event.
          allEvents.length > 0
          ? allEvents.length - 1
          : // Otherwise there are no events before the current block height.
            undefined

      if (currentEventIndex !== undefined) {
        initialCache[key] = [allEvents[currentEventIndex]]

        // Remove all events that are before the current event we found, since
        // future computations will only go up. Keep the one we found in case
        // it's used in the future.
        allEventsByContractAndKey[key] = allEvents.slice(currentEventIndex)
      } else {
        initialCache[key] = null
      }
    }
    for (const prefixKey of mapPrefixes) {
      const contractKeyEventEntries = Object.entries(
        allEventsByContractAndKey
      ).filter(([key]) => key.startsWith(prefixKey))

      // Sorted ascending by block height, so we can find the latest event for
      // each unique key in the map before or at the current block height by
      // finding the index of the first event for each that is after the current
      // block height and subtracting 1.
      const currentEventIndexes = contractKeyEventEntries.map(([, events]) => {
        if (!events) {
          return undefined
        }

        const nextEventIndex = events.findIndex(
          (event) => event.blockHeight > block.height
        )

        // If the next event index is undefined or is the first event, there is
        // no current event.
        return nextEventIndex === undefined || nextEventIndex === 0
          ? undefined
          : // If the next event index is greater than 0, the current event is the
          // most recent event before this one, so subtract one.
          nextEventIndex > 0
          ? nextEventIndex - 1
          : // If the next event index is -1, meaning no events matched the predicate, and there is only one event, the current event is the only event.
          events.length === 1
          ? 0
          : // Otherwise there are no events before the current block height.
            undefined
      })

      initialCache[prefixKey] = currentEventIndexes
        .map((currentEventIndex, entryIndex) =>
          currentEventIndex !== undefined
            ? contractKeyEventEntries[entryIndex][1]![currentEventIndex]
            : null
        )
        .filter((event): event is Event => event !== null)

      // Remove all events that are before the current event we found for each
      // key, since future computations will only go up. Keep the one we found
      // in case it's used in the future.
      currentEventIndexes.forEach((currentEventIndex, entryIndex) => {
        if (currentEventIndex !== undefined) {
          allEventsByContractAndKey[contractKeyEventEntries[entryIndex][0]] =
            allEventsByContractAndKey[
              contractKeyEventEntries[entryIndex][0]
            ]?.slice(currentEventIndex)
        }
      })
    }

    // Add hook to env so that the getters update the latest block info.
    const dependentKeys = new Set<string>()
    const env = getEnv(
      targetContract.address,
      block,
      args,
      dependentKeys,
      onFetchEvents,
      initialCache
    )

    const value = await formula(env)

    return {
      latestBlock,
      value,
      dependentKeys: Array.from(dependentKeys),
      eventsUsed,
    }
  }

  const results: ComputationOutput[] = []

  let nextPotentialBlock: Block | undefined = blockStart
  while (nextPotentialBlock && nextPotentialBlock.height <= blockEnd.height) {
    const currentBlock: Block = nextPotentialBlock
    const result = await computeForBlockInRange(currentBlock)

    const previousResult = results[results.length - 1]
    // Only store result if it's the first result or different from the most
    // recently stored result.
    if (!previousResult || result.value !== previousResult.value) {
      // If there is a previous result, update its latest valid block height to
      // just before this one, since there's now a new value.
      if (previousResult && result.latestBlock) {
        previousResult.latestBlockHeightValid = result.latestBlock.height - 1
      }

      results.push({
        block: result.latestBlock,
        value: result.value,
        dependentKeys: result.dependentKeys,
        // At least valid until the requested block, which may be equal to or
        // after the latestBlock returned in the result.
        latestBlockHeightValid: currentBlock.height,
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
        order: [['blockHeight', 'ASC']],
      })

      // Save for future computations.
      futureEvents.forEach((event) => {
        const key = `${event.contractAddress}:${event.key}`
        if (key in allEventsByContractAndKey) {
          allEventsByContractAndKey[key]!.push(event)
        } else {
          // If making new events array, insert events used in the formula
          // first. This way we cache the most recent events before the current
          // block that were used since they weren't fetched above when getting
          // all future events.
          allEventsByContractAndKey[key] = [
            ...result.eventsUsed.filter(
              (usedEvent) =>
                usedEvent.contractAddress === event.contractAddress &&
                usedEvent.key === event.key
            ),
            event,
          ]
            // Sort ascending.
            .sort((a, b) => a.blockHeight - b.blockHeight)
        }
      })
      newDependentKeys.forEach((key) => allDependentKeys.add(key))
    }

    // Find the next event that has the potential to change the result for the
    // given dependent keys. If it remains undefined, then we know that the
    // result will not change because no inputs changed.
    nextPotentialBlock = undefined

    const { nonMapKeys: nextNonMapKeys, mapPrefixes: nextMapPrefixes } =
      Event.splitDependentKeys(Array.from(result.dependentKeys))
    for (const key of nextNonMapKeys) {
      // Sorted ascending by block height, so we can find the next event for a
      // given key that is after the current block height by selecting the first
      // one.
      const matchingEvent = allEventsByContractAndKey[key]?.find(
        (event) => event.blockHeight > currentBlock.height
      )

      if (
        matchingEvent &&
        (nextPotentialBlock === undefined ||
          matchingEvent.blockHeight < nextPotentialBlock.height)
      ) {
        nextPotentialBlock = matchingEvent.block
      }
    }
    for (const prefixKey of nextMapPrefixes) {
      // Sorted ascending by block height, so we can find the next event for
      // for each unique key in the map after the current block height by
      // finding the first one.
      const matchingEvents = Object.entries(allEventsByContractAndKey)
        .filter(([key]) => key.startsWith(prefixKey))
        .map(([, events]) =>
          events?.find((event) => event.blockHeight > currentBlock.height)
        )
        .filter((event): event is Event => event !== undefined)

      const nextEvent = matchingEvents.sort(
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
