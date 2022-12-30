import { Op } from 'sequelize'

import { Event, Transformation } from '../db/models'
import { getEnv } from './env'
import {
  Block,
  Cache,
  ComputationOutput,
  ComputeOptions,
  ComputeRangeOptions,
  Dependencies,
  SetDependencies,
} from './types'

export const compute = async ({
  targetAddress,
  args,
  block,
  ...options
}: ComputeOptions): Promise<ComputationOutput> => {
  // Store the latest block that we've seen for all keys accessed. This is when
  // this computation became valid, i.e. the earliest this computation could
  // have been made to get this output.
  let latestBlock: Block | undefined

  const onFetch = async (
    events: Event[],
    transformations: Transformation[]
  ) => {
    const latestItem: Event | Transformation = [
      ...events,
      ...transformations,
    ].sort((a, b) => b.blockHeight - a.blockHeight)[0]

    // If latest is unset, or if we found a later block height, update.
    if (
      latestBlock === undefined ||
      latestItem.blockHeight > latestBlock.height
    ) {
      latestBlock = latestItem.block
    }
  }

  const dependencies: SetDependencies = {
    events: new Set<string>(),
    transformations: new Set<string>(),
  }

  const env = getEnv(block, args, dependencies, onFetch)
  const value =
    options.type === 'contract'
      ? await options.formula({
          ...env,
          contractAddress: targetAddress,
        })
      : await options.formula({
          ...env,
          walletAddress: targetAddress,
        })

  return {
    block: latestBlock,
    value,
    dependencies: {
      events: Array.from(dependencies.events),
      transformations: Array.from(dependencies.transformations),
    },
  }
}

export const computeRange = async ({
  targetAddress,
  args,
  blockStart,
  blockEnd,
  ...options
}: ComputeRangeOptions): Promise<ComputationOutput[]> => {
  // Dependencies seen so far.
  const allDependencies: SetDependencies = {
    events: new Set<string>(),
    transformations: new Set<string>(),
  }
  // All events for contractAddress:key pairs, sorted ascending by block height.
  // These keys are different from dependent keys because dependent keys can
  // include map prefixes. We need to store all events for each key so we can
  // find the first event for a given key based on dynamic block height
  // constraints. Map contents may change based on many different keys, so maps
  // need to be reconstructed by individual key comparisons, meaning we need to
  // store keys separately here and not combined into their maps.
  const allEvents: Record<string, Event[] | undefined> = {}
  // All transformations for contractAddress:name pairs, sorted ascending by
  // block height.
  const allTransformations: Record<string, Transformation[] | undefined> = {}

  const computeForBlockInRange = async (
    block: Block
  ): Promise<{
    latestBlock: Block | undefined
    value: any
    dependencies: Dependencies
    eventsUsed: Event[]
    transformationsUsed: Transformation[]
  }> => {
    // Store the latest block that we've seen for all keys accessed. This is the
    // earliest this computation could have been made.
    let latestBlock: Block | undefined

    // Store the events and transformations used for this computation.
    let eventsUsed: Event[] = []
    let transformationsUsed: Transformation[] = []

    const onFetch = async (
      events: Event[],
      transformations: Transformation[]
    ) => {
      if (events.length) {
        eventsUsed = [...eventsUsed, ...events]
      }
      if (transformations.length) {
        transformationsUsed = [...transformationsUsed, ...transformations]
      }

      const latestItem: Event | Transformation = [
        ...events,
        ...transformations,
      ].sort((a, b) => b.blockHeight - a.blockHeight)[0]

      // If latest is unset, or if we found a later block height, update.
      if (
        latestBlock === undefined ||
        latestItem.blockHeight > latestBlock.height
      ) {
        latestBlock = latestItem.block
      }
    }

    // Build cache from all dependent events and transformations already loaded.
    const initialCache: Cache = {
      events: {},
      transformations: {},
    }

    if (allDependencies.events.size > 0) {
      const { nonMapKeys, mapPrefixes } = Event.splitDependentKeys(
        Array.from(allDependencies.events)
      )
      for (const key of nonMapKeys) {
        const allEventsForThisKey = allEvents[key]
        // No events found for this key, cache null to indicate it doesn't exist
        // and prevent querying for it.
        if (!allEventsForThisKey) {
          initialCache.events[key] = null
          continue
        }

        // Sorted ascending by block height, so we can find the latest event for
        // a given key that is before or at the current block height by finding
        // the index of the first event that is after the current block height
        // and subtracting 1.
        const nextIndex = allEventsForThisKey.findIndex(
          (event) => event.blockHeight > block.height
        )

        const currentIndex =
          // If the next event index is undefined or is the first event, there
          // is no current event.
          nextIndex === undefined || nextIndex === 0
            ? undefined
            : // If the next event index is greater than 0, the current event is the
            // most recent event before this one, so subtract one.
            nextIndex > 0
            ? nextIndex - 1
            : // If the next event index is -1, meaning no events matched the predicate, and events exist, the current event is the last event.
            allEventsForThisKey.length > 0
            ? allEventsForThisKey.length - 1
            : // Otherwise there are no events before the current block height.
              undefined

        if (currentIndex !== undefined) {
          initialCache.events[key] = [allEventsForThisKey[currentIndex]]

          // Remove all events that are before the current event we found, since
          // future computations will only go up. Keep the one we found in case
          // it's used in the future.
          allEvents[key] = allEventsForThisKey.slice(currentIndex)
        } else {
          initialCache.events[key] = null
        }
      }
      for (const prefixKey of mapPrefixes) {
        const contractKeyEventEntries = Object.entries(allEvents).filter(
          ([key]) => key.startsWith(prefixKey)
        )

        // Sorted ascending by block height, so we can find the latest event for
        // each unique key in the map before or at the current block height by
        // finding the index of the first event for each that is after the
        // current block height and subtracting 1.
        const currentIndexes = contractKeyEventEntries.map(([, events]) => {
          if (!events) {
            return undefined
          }

          const nextIndex = events.findIndex(
            (event) => event.blockHeight > block.height
          )

          // If the next event index is undefined or is the first event, there
          // is no current event.
          return nextIndex === undefined || nextIndex === 0
            ? undefined
            : // If the next event index is greater than 0, the current event is the most recent event before this one, so subtract one.
            nextIndex > 0
            ? nextIndex - 1
            : // If the next event index is -1, meaning no events matched the predicate, and there is only one event, the current event is the only event.
            events.length === 1
            ? 0
            : // Otherwise there are no events before the current block height.
              undefined
        })

        initialCache.events[prefixKey] = currentIndexes
          .map((currentEventIndex, entryIndex) =>
            currentEventIndex !== undefined
              ? contractKeyEventEntries[entryIndex][1]![currentEventIndex]
              : null
          )
          .filter((event): event is Event => event !== null)

        // Remove all events that are before the current event we found for each
        // key, since future computations will only go up. Keep the one we found
        // in case it's used in the future.
        currentIndexes.forEach((currentEventIndex, entryIndex) => {
          if (currentEventIndex !== undefined) {
            allEvents[contractKeyEventEntries[entryIndex][0]] =
              allEvents[contractKeyEventEntries[entryIndex][0]]?.slice(
                currentEventIndex
              )
          }
        })
      }
    }
    for (const key of allDependencies.transformations) {
      const allTransformationsForThisKey = allTransformations[key]
      // No transformations found for this key, cache null to indicate it
      // doesn't exist and prevent querying for it.
      if (!allTransformationsForThisKey) {
        initialCache.transformations[key] = null
        continue
      }

      // Sorted ascending by block height, so we can find the latest
      // transformation for a given key that is before or at the current block
      // height by finding the index of the first transformation that is after
      // the current block height and subtracting 1.
      const nextIndex = allTransformationsForThisKey.findIndex(
        (transformation) => transformation.blockHeight > block.height
      )

      const currentIndex =
        // If the next index is undefined or is the first one, there is no
        // current transformation.
        nextIndex === undefined || nextIndex === 0
          ? undefined
          : // If the next index is greater than 0, the current transformation is the most recent before this one, so subtract one.
          nextIndex > 0
          ? nextIndex - 1
          : // If the next index is -1, meaning no transformations matched the predicate, and transformations exist, the current transformation is the last one.
          allTransformationsForThisKey.length > 0
          ? allTransformationsForThisKey.length - 1
          : // Otherwise there are no transformations before the current block height.
            undefined

      if (currentIndex !== undefined) {
        initialCache.transformations[key] = [
          allTransformationsForThisKey[currentIndex],
        ]

        // Remove all transformations that are before the current one we found,
        // since future computations will only go up. Keep the one we found in
        // case it's used in the future.
        allTransformations[key] =
          allTransformationsForThisKey.slice(currentIndex)
      } else {
        initialCache.transformations[key] = null
      }
    }

    // Add hook to env so that the getters update the latest block info.
    const dependencies: SetDependencies = {
      events: new Set<string>(),
      transformations: new Set<string>(),
    }

    const env = getEnv(block, args, dependencies, onFetch, initialCache)
    const value =
      options.type === 'contract'
        ? await options.formula({
            ...env,
            contractAddress: targetAddress,
          })
        : await options.formula({
            ...env,
            walletAddress: targetAddress,
          })

    return {
      latestBlock,
      value,
      dependencies: {
        events: Array.from(dependencies.events),
        transformations: Array.from(dependencies.transformations),
      },
      eventsUsed,
      transformationsUsed,
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
        dependencies: result.dependencies,
        // At least valid until the requested block, which may be equal to or
        // after the latestBlock returned in the result.
        latestBlockHeightValid: currentBlock.height,
      })
    }

    // Preload all events for new dependencies seen until the end.
    const newDependentEvents = result.dependencies.events.filter(
      (key) => !allDependencies.events.has(key)
    )
    if (newDependentEvents.length > 0) {
      const futureEvents = await Event.findAll({
        where: {
          // After the current block up to the end block.
          blockHeight: {
            [Op.gt]: currentBlock.height,
            [Op.lte]: blockEnd.height,
          },
          ...Event.getWhereClauseForDependentKeys(newDependentEvents),
        },
        order: [['blockHeight', 'ASC']],
      })

      // Save for future computations.
      futureEvents.forEach((event) => {
        if (event.dependentKey in allEvents) {
          allEvents[event.dependentKey]!.push(event)
        } else {
          // If making new array, insert events used in the formula before
          // future event. This way we cache the most recent events below the
          // current block since they weren't fetched when getting all future
          // events.
          allEvents[event.dependentKey] = [
            ...result.eventsUsed.filter(
              (usedEvent) => usedEvent.dependentKey === event.dependentKey
            ),
            event,
          ]
            // Sort ascending.
            .sort((a, b) => a.blockHeight - b.blockHeight)
        }
      })
      newDependentEvents.forEach((key) => allDependencies.events.add(key))
    }

    // Preload all transformations for new dependencies seen until the end.
    const newDependentTransformations =
      result.dependencies.transformations.filter(
        (key) => !allDependencies.transformations.has(key)
      )
    if (newDependentTransformations.length > 0) {
      const futureTransformations = await Transformation.findAll({
        where: {
          // After the current block up to the end block.
          blockHeight: {
            [Op.gt]: currentBlock.height,
            [Op.lte]: blockEnd.height,
          },
          ...Transformation.getWhereClauseForDependentKeys(
            newDependentTransformations
          ),
        },
        order: [['blockHeight', 'ASC']],
      })

      // Save for future computations.
      futureTransformations.forEach((transformation) => {
        if (transformation.dependentKey in allEvents) {
          allTransformations[transformation.dependentKey]!.push(transformation)
        } else {
          // If making new array, insert transformations used in the formula
          // before future transformation. This way we cache the most recent
          // transformations below the current block since they weren't fetched
          // when getting all future transformations.
          allTransformations[transformation.dependentKey] = [
            ...result.transformationsUsed.filter(
              (usedTransformation) =>
                usedTransformation.dependentKey === transformation.dependentKey
            ),
            transformation,
          ]
            // Sort ascending.
            .sort((a, b) => a.blockHeight - b.blockHeight)
        }
      })
      // Add to all dependencies so we don't fetch these again.
      newDependentTransformations.forEach((key) =>
        allDependencies.transformations.add(key)
      )
    }

    // Find the next event or transformation that has the potential to change
    // the result for the given dependencies. If it remains undefined, then we
    // know that the result will not change because no inputs changed.
    nextPotentialBlock = undefined

    if (result.dependencies.events.length > 0) {
      const { nonMapKeys: nextNonMapKeys, mapPrefixes: nextMapPrefixes } =
        Event.splitDependentKeys(result.dependencies.events)
      for (const key of nextNonMapKeys) {
        // Sorted ascending by block height, so we can find the next event for a
        // given key that is after the current block height by selecting the first
        // one.
        const matchingEvent = allEvents[key]?.find(
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
        const matchingEvents = Object.entries(allEvents)
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

    for (const key of result.dependencies.transformations) {
      // Sorted ascending by block height, so we can find the next
      // transformation for a given key that is after the current block height
      // by selecting the first one.
      const matchingTransformation = allTransformations[key]?.find(
        (transformation) => transformation.blockHeight > currentBlock.height
      )

      if (
        matchingTransformation &&
        (nextPotentialBlock === undefined ||
          matchingTransformation.blockHeight < nextPotentialBlock.height)
      ) {
        nextPotentialBlock = matchingTransformation.block
      }
    }
  }

  return results
}
