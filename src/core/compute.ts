import { Op } from 'sequelize'

import { Contract, Event, Transformation } from '@/db'

import { getEnv } from './env'
import {
  Block,
  Cache,
  CacheMap,
  CacheMapSingle,
  ComputationOutput,
  ComputeOptions,
  ComputeRangeOptions,
  Dependencies,
  FormulaType,
  SetDependencies,
  SplitDependentKeys,
} from './types'

export const compute = async ({
  targetAddress,
  args,
  block,
  ...options
}: ComputeOptions): Promise<ComputationOutput> => {
  // Store the latest block that we've seen for all keys accessed. This is when
  // this computation became valid, i.e. the earliest this computation could
  // have been made to get this output. If the formula is dynamic, then the
  // current block is the earliest/latest block this is valid for (i.e. it's
  // only valid at this block).
  let latestBlock: Block | undefined = options.formula.dynamic
    ? block
    : undefined

  const onFetch = async (
    events: Event[],
    transformations: Transformation[]
  ) => {
    const latestItem: Event | Transformation = [
      ...events,
      ...transformations,
    ].sort((a, b) => Number(b.blockHeight - a.blockHeight))[0]

    // If latest is unset, or if we found a later block height, update.
    if (
      latestItem &&
      (latestBlock === undefined || latestItem.blockHeight > latestBlock.height)
    ) {
      latestBlock = latestItem.block
    }
  }

  const dependencies: SetDependencies = {
    events: new Set<string>(),
    transformations: new Set<string>(),
  }

  const env = getEnv({
    block,
    args,
    dependencies,
    onFetch,
  })
  const value =
    options.type === FormulaType.Contract
      ? await options.formula.compute({
          ...env,
          contractAddress: targetAddress,
        })
      : options.type === FormulaType.Wallet
      ? await options.formula.compute({
          ...env,
          walletAddress: targetAddress,
        })
      : await options.formula.compute(env)

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

  // Cache contracts across all computations since they stay constant.
  const contractCache: CacheMapSingle<Contract> = {}

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
    // earliest this computation could have been made. If the formula is
    // dynamic, then the current block is the earliest/latest block this is
    // valid for (i.e. it's only valid at this block).
    let latestBlock: Block | undefined = options.formula.dynamic
      ? block
      : undefined

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
      ].sort((a, b) => Number(b.blockHeight - a.blockHeight))[0]

      // If latest is unset, or if we found a later block height, update.
      if (
        latestItem &&
        (latestBlock === undefined ||
          latestItem.blockHeight > latestBlock.height)
      ) {
        latestBlock = latestItem.block
      }
    }

    // Build cache from all dependent events and transformations already loaded.
    const initialCache: Cache = {
      events: {},
      transformations: {},
      contracts: contractCache,
    }

    if (allDependencies.events.size > 0) {
      addToCache(
        Event.splitDependentKeys(Array.from(allDependencies.events)),
        allEvents,
        initialCache.events,
        block
      )
    }
    if (allDependencies.transformations.size > 0) {
      addToCache(
        Transformation.splitDependentKeys(
          Array.from(allDependencies.transformations)
        ),
        allTransformations,
        initialCache.transformations,
        block
      )
    }

    const dependencies: SetDependencies = {
      events: new Set<string>(),
      transformations: new Set<string>(),
    }

    const env = getEnv({
      block,
      args,
      dependencies,
      onFetch,
      cache: initialCache,
    })
    const value =
      options.type === FormulaType.Contract
        ? await options.formula.compute({
            ...env,
            contractAddress: targetAddress,
          })
        : options.type === FormulaType.Wallet
        ? await options.formula.compute({
            ...env,
            walletAddress: targetAddress,
          })
        : await options.formula.compute(env)

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
      // If there is a previous result and the formula is not dynamic height,
      // update its latest valid block height to just before this one, since
      // there's now a new value. If the formula is dynamic, then the previous
      // result's latest valid block height is already correct.
      if (previousResult && result.latestBlock && !options.formula.dynamic) {
        previousResult.latestBlockHeightValid = result.latestBlock.height - 1n
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
            .sort((a, b) => Number(a.blockHeight - b.blockHeight))
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
            .sort((a, b) => Number(a.blockHeight - b.blockHeight))
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
    nextPotentialBlock = undefined as Block | undefined

    if (result.dependencies.events.length > 0) {
      const eventNextPotentialBlock = getNextPotentialBlock(
        Event.splitDependentKeys(result.dependencies.events),
        allEvents,
        currentBlock
      )

      if (
        eventNextPotentialBlock &&
        (nextPotentialBlock === undefined ||
          eventNextPotentialBlock.height < nextPotentialBlock.height)
      ) {
        nextPotentialBlock = eventNextPotentialBlock
      }
    }
    if (result.dependencies.transformations.length > 0) {
      const transformationNextPotentialBlock = getNextPotentialBlock(
        Transformation.splitDependentKeys(result.dependencies.transformations),
        allTransformations,
        currentBlock
      )

      if (
        transformationNextPotentialBlock &&
        (nextPotentialBlock === undefined ||
          transformationNextPotentialBlock.height < nextPotentialBlock.height)
      ) {
        nextPotentialBlock = transformationNextPotentialBlock
      }
    }
  }

  return results
}

const addToCache = <T extends Event | Transformation>(
  { nonMapKeys, mapPrefixes }: SplitDependentKeys,
  allItems: Record<string, T[] | undefined>,
  initialCacheMap: CacheMap<T>,
  block: Block
) => {
  for (const key of nonMapKeys) {
    const allItemsForThisKey = allItems[key]
    // No items found for this key, cache null to indicate it doesn't exist and
    // pritem querying for it.
    if (!allItemsForThisKey) {
      initialCacheMap[key] = null
      continue
    }

    // Sorted ascending by block height, so we can find the latest item for a
    // given key that is before or at the current block height by finding the
    // index of the first item that is after the current block height and
    // subtracting 1.
    const nextIndex = allItemsForThisKey.findIndex(
      (item) => item.blockHeight > block.height
    )

    const currentIndex =
      // If the next item index is undefined or is the first item, there is no
      // current item.
      nextIndex === undefined || nextIndex === 0
        ? undefined
        : // If the next item index is greater than 0, the current item is the
        // most recent item before this one, so subtract one.
        nextIndex > 0
        ? nextIndex - 1
        : // If the next item index is -1, meaning no items matched the predicate, and items exist, the current item is the last item.
        allItemsForThisKey.length > 0
        ? allItemsForThisKey.length - 1
        : // Otherwise there are no items before the current block height.
          undefined

    if (currentIndex !== undefined) {
      initialCacheMap[key] = [allItemsForThisKey[currentIndex]]

      // Remove all items that are before the current item we found, since
      // future computations will only go up. Keep the one we found in case it's
      // used in the future.
      allItems[key] = allItemsForThisKey.slice(currentIndex)
    } else {
      initialCacheMap[key] = null
    }
  }
  for (const prefixKey of mapPrefixes) {
    const contractKeyItemEntries = Object.entries(allItems).filter(([key]) =>
      key.startsWith(prefixKey)
    )

    // Sorted ascending by block height, so we can find the latest item for each
    // unique key in the map before or at the current block height by finding
    // the index of the first item for each that is after the current block
    // height and subtracting 1.
    const currentIndexes = contractKeyItemEntries.map(([, items]) => {
      if (!items) {
        return undefined
      }

      const nextIndex = items.findIndex(
        (item) => item.blockHeight > block.height
      )

      // If the next item index is undefined or is the first item, there is no
      // current item.
      return nextIndex === undefined || nextIndex === 0
        ? undefined
        : // If the next item index is greater than 0, the current item is the most recent item before this one, so subtract one.
        nextIndex > 0
        ? nextIndex - 1
        : // If the next item index is -1, meaning no items matched the predicate, and there is only one item, the current item is the only item.
        items.length === 1
        ? 0
        : // Otherwise there are no items before the current block height.
          undefined
    })

    initialCacheMap[prefixKey] = currentIndexes
      .map((currentItemIndex, entryIndex) =>
        currentItemIndex !== undefined
          ? contractKeyItemEntries[entryIndex][1]![currentItemIndex]
          : null
      )
      .filter((item): item is T => item !== null)

    // Remove all items that are before the current item we found for each key,
    // since future computations will only go up. Keep the one we found in case
    // it's used in the future.
    currentIndexes.forEach((currentItemIndex, index) => {
      if (currentItemIndex !== undefined) {
        allItems[contractKeyItemEntries[index][0]] =
          allItems[contractKeyItemEntries[index][0]]?.slice(currentItemIndex)
      }
    })
  }
}

// Find the next item that has the potential to change the result for the given
// keys. If it remains undefined, then we know that the result will not change
// because no inputs changed.
export const getNextPotentialBlock = <T extends Event | Transformation>(
  { nonMapKeys, mapPrefixes }: SplitDependentKeys,
  allItems: Record<string, T[] | undefined>,
  currentBlock: Block
): Block | undefined => {
  let nextPotentialBlock: Block | undefined

  for (const key of nonMapKeys) {
    // Sorted ascending by block height, so we can find the next item for a
    // given key that is after the current block height by selecting the first
    // one.
    const matchingItem = allItems[key]?.find(
      (item) => item.blockHeight > currentBlock.height
    )

    if (
      matchingItem &&
      (nextPotentialBlock === undefined ||
        matchingItem.blockHeight < nextPotentialBlock.height)
    ) {
      nextPotentialBlock = matchingItem.block
    }
  }

  for (const prefixKey of mapPrefixes) {
    // Sorted ascending by block height, so we can find the next item for for
    // each unique key in the map after the current block height by finding the
    // first one.
    const matchingItems = Object.entries(allItems)
      .filter(([key]) => key.startsWith(prefixKey))
      .map(([, items]) =>
        items?.find((item) => item.blockHeight > currentBlock.height)
      )
      .filter((item): item is T => item !== undefined)

    const nextItem = matchingItems.sort((a, b) =>
      Number(a.blockHeight - b.blockHeight)
    )[0]
    if (
      nextItem &&
      (nextPotentialBlock === undefined ||
        nextItem.blockHeight < nextPotentialBlock.height)
    ) {
      nextPotentialBlock = nextItem.block
    }
  }

  return nextPotentialBlock
}
