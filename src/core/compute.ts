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
  // Dependent keys seen so far.
  const allDependentKeys = new Set<string>()
  // All events for contractAddress:key pairs. All events for a given key should
  // be sorted in descending order. This is different from dependent keys, which
  // may include map prefixes. We need to store all events for each key so we
  // can find the first event for a given key based on dynamic block height
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
      const allEvents = allEventsByContractAndKey[key]

      // Sorted descending by block height, so we can find the latest event for
      // a given key that is before or equal to the current block height by
      // finding the index of the last event that is after the current block
      // height and adding 1.
      const nextEventIndex = allEvents
        ? findLastIndex(allEvents, (event) => event.blockHeight > block.height)
        : undefined

      if (
        allEvents &&
        nextEventIndex !== undefined &&
        // Ensure there is at least one event before the next event (before
        // being after in the array since it is descending).
        nextEventIndex < allEvents.length - 1
      ) {
        // Add 1 to get the index of the event we want.
        const currentEventIndex = nextEventIndex + 1

        initialCache[key] = [allEvents[currentEventIndex]]

        // Remove all events that are older (earlier block height) than the
        // current event we found, since future computations will only go up.
        // Keep the one we found in case it's used in the future.
        allEventsByContractAndKey[key] = allEvents.slice(
          0,
          currentEventIndex + 1
        )
      } else {
        initialCache[key] = null
      }
    }
    for (const prefixKey of mapPrefixes) {
      const contractKeyEventEntries = Object.entries(
        allEventsByContractAndKey
      ).filter(([key]) => key.startsWith(prefixKey))

      // Sorted descending by block height, so we can find the latest event for
      // each unique key in the map before or equal to the current block height
      // by finding the index of the last event for each that is after the
      // current block height and adding 1.
      const nextEventIndexes = contractKeyEventEntries.map(([, events]) =>
        events
          ? findLastIndex(events, (event) => event.blockHeight > block.height)
          : undefined
      )

      initialCache[prefixKey] = nextEventIndexes
        .map((nextEventIndex, entryIndex) =>
          nextEventIndex !== undefined &&
          nextEventIndex < contractKeyEventEntries[entryIndex][1]!.length - 1
            ? // Add 1 to get the index of the event we want.
              contractKeyEventEntries[entryIndex][1]![nextEventIndex + 1]
            : null
        )
        .filter((event): event is Event => event !== null)

      // Remove all events that are older (earlier block height) than the
      // current event we found for each key, since future computations will
      // only go up. Keep the one we found in case it's used in the future.
      nextEventIndexes.forEach((nextEventIndex, entryIndex) => {
        if (
          nextEventIndex !== undefined &&
          nextEventIndex < contractKeyEventEntries[entryIndex][1]!.length - 1
        ) {
          allEventsByContractAndKey[contractKeyEventEntries[entryIndex][0]] =
            allEventsByContractAndKey[contractKeyEventEntries[entryIndex][0]]
              // Add 1 to get the index of the event we want, and one more to
              // include the event we found in case it's used again.
              ?.slice(0, nextEventIndex + 1 + 1)
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
      futureEvents.forEach((event) => {
        const key = `${event.contractAddress}:${event.key}`
        if (key in allEventsByContractAndKey) {
          allEventsByContractAndKey[key]!.push(event)
        } else {
          allEventsByContractAndKey[key] = [event]
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
      // Sorted descending by block height, so we can find the next event for a
      // given key that is after the current block height by selecting the last
      // one.
      const matchingEvent = allEventsByContractAndKey[key]
        ? findLast(
            allEventsByContractAndKey[key]!,
            (event) => event.blockHeight > currentBlock.height
          )
        : undefined

      if (
        matchingEvent &&
        (nextPotentialBlock === undefined ||
          matchingEvent.blockHeight < nextPotentialBlock.height)
      ) {
        nextPotentialBlock = matchingEvent.block
      }
    }
    for (const prefixKey of nextMapPrefixes) {
      // Sorted descending by block height, so we can find the next event for
      // for each unique key in the map after the current block height by
      // finding the last event for each.
      const matchingEvents = Object.entries(allEventsByContractAndKey)
        .filter(([key]) => key.startsWith(prefixKey))
        .map(([, events]) =>
          events
            ? findLast(
                events,
                (event) => event.blockHeight > currentBlock.height
              )
            : undefined
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

const findLast = <T>(
  arr: T[],
  predicate: (item: T) => boolean
): T | undefined => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      return arr[i]
    }
  }
  return undefined
}

const findLastIndex = <T>(
  arr: T[],
  predicate: (item: T) => boolean
): number | undefined => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      return i
    }
  }
  return undefined
}
