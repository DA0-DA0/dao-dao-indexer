import { Op, Sequelize } from 'sequelize'

import { Contract, Event } from '../db/models'
import {
  Block,
  ComputationOutput,
  Env,
  Formula,
  FormulaDateGetter,
  FormulaGetter,
  FormulaMapGetter,
  FormulaPrefetch,
} from './types'
import { dbKeyForKeys, dbKeyToNumber, dbKeyToString } from './utils'

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

  const env = getEnv(targetContract.address, block, args, updateLatestBlock)

  const value = await formula(env)

  return {
    block: latestBlock,
    value,
  }
}

export const computeRange = async (
  formula: Formula,
  targetContract: Contract,
  args: Record<string, any>,
  blockStart: Block,
  blockEnd: Block
): Promise<ComputationOutput[]> => {
  const computeForBlockInRange = async (
    block: Block
  ): Promise<{
    nextPotentialBlock: Block | undefined
    latestBlock: Block | undefined
    value: any
  }> => {
    // Store the next block that has the potential to change the result. Each
    // getter below will update this value if it finds a key change event after
    // the current block we're computing. If it remains undefined, then we know
    // that the result will not change because no inputs changed.
    let nextPotentialBlock: Block | undefined

    // Find the next event that may change the result for the given key filter
    // and update accordingly. Ignore any events after the end block.
    const updateNextChangedBlock = async (
      contractAddress: string,
      keyFilter: string | object
    ) => {
      const nextEvent = await Event.findOne({
        where: {
          contractAddress,
          key: keyFilter,
          // After the current block and at or before the end block.
          blockHeight: {
            [Op.gt]: block.height,
            [Op.lte]: blockEnd.height,
          },
        },
        order: [['blockHeight', 'ASC']],
      })

      // If we found an event, and it's earlier than the current next potential
      // block (or if we haven't found one yet), update.
      if (
        nextEvent &&
        (nextPotentialBlock === undefined ||
          nextEvent.blockHeight < nextPotentialBlock.height)
      ) {
        nextPotentialBlock = nextEvent.block
      }
    }

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

    // Add hook to env so that the getters update the latest block info and next
    // changed block height.
    const env = getEnv(
      targetContract.address,
      block,
      args,
      async (events, keyFilter) => {
        await updateLatestBlock(events)
        await updateNextChangedBlock(targetContract.address, keyFilter)
      }
    )

    const value = await formula(env)

    return {
      nextPotentialBlock,
      latestBlock,
      value,
    }
  }

  const results: ComputationOutput[] = []

  // Start at the beginning block and compute the value. Each computation will
  // return with its value and the next block that may change the result. We can
  // then start at that block and compute again. We repeat this until we reach
  // the end block.
  let nextPotentialBlock = blockStart
  while (nextPotentialBlock.height <= blockEnd.height) {
    const result = await computeForBlockInRange(nextPotentialBlock)

    const previousResult = results[results.length - 1]
    // Only store result if it's the first result or different from the most
    // recently stored result.
    if (!previousResult || result.value !== previousResult.value) {
      results.push({
        block: result.latestBlock,
        value: result.value,
      })
    }

    // If no future block may change the result, stop.
    if (result.nextPotentialBlock === undefined) {
      break
    }

    nextPotentialBlock = result.nextPotentialBlock
  }

  return results
}

// Generate environment for computation.
const getEnv = (
  contractAddress: string,
  block: Block,
  args: Record<string, any>,
  onFetchEvents?: (
    events: Event[],
    keyFilter: string | object
  ) => void | Promise<void>
): Env<{}> => {
  // Most recent event at or below this block.
  const blockHeightFilter = {
    blockHeight: {
      [Op.lte]: block.height,
    },
  }

  // Cache event for key, or events for map. Null if event(s) nonexistent.
  const cache: Record<string, Event[] | null | undefined> = {}

  const get: FormulaGetter = async (contractAddress, ...keys) => {
    const key = dbKeyForKeys(...keys)
    // Check cache.
    const cacheKey = `${contractAddress}:${key}`
    const cachedEvent = cache[cacheKey]

    const event =
      // If undefined, we haven't tried to fetch it yet. If not undefined,
      // either it exists or it doesn't (null).
      cachedEvent !== undefined
        ? cachedEvent?.[0]
        : await Event.findOne({
            where: {
              contractAddress,
              key,
              ...blockHeightFilter,
            },
            order: [['blockHeight', 'DESC']],
          })

    // Cache event, null if nonexistent.
    if (cachedEvent === undefined) {
      cache[cacheKey] = event ? [event] : null
    }

    // Call hook.
    await onFetchEvents?.(event ? [event] : [], key)

    // If no event found or key was deleted, return undefined.
    if (!event || event.delete) {
      return undefined
    }

    const value = JSON.parse(event.value ?? 'null')

    return value
  }

  const getMap: FormulaMapGetter = async (
    contractAddress,
    name,
    { numericKeys = false } = {}
  ) => {
    const keyPrefix =
      (Array.isArray(name)
        ? // Add an empty key at the end so the name(s) are treated as a prefix. Prefixes have their lengths encoded in the key and are treated differently from the final key in the tuple.
          dbKeyForKeys(...name, '')
        : dbKeyForKeys(name, '')) + ','
    // Check cache.
    const cacheKey = `${contractAddress}:${keyPrefix}`
    const cachedEvents = cache[cacheKey]

    const keyFilter = {
      [Op.like]: `${keyPrefix}%`,
    }
    const events =
      // If undefined, we haven't tried to fetch them yet. If not undefined,
      // either they exist or they don't (null).
      cachedEvents !== undefined
        ? cachedEvents ?? []
        : await Event.findAll({
            attributes: [
              // DISTINCT ON is not directly supported by Sequelize, so we need to
              // cast to unknown and back to string to insert this at the beginning of
              // the query. This ensures we use the most recent version of the key.
              Sequelize.literal(
                'DISTINCT ON("key") "key"'
              ) as unknown as string,
              'key',
              'contractAddress',
              'blockHeight',
              'blockTimeUnixMs',
              'value',
              'delete',
            ],
            where: {
              contractAddress,
              key: keyFilter,
              ...blockHeightFilter,
            },
            order: [
              // Needs to be first so we can use DISTINCT ON.
              ['key', 'ASC'],
              ['blockHeight', 'DESC'],
            ],
          })

    // Cache events, null if nonexistent.
    if (cachedEvents === undefined) {
      cache[cacheKey] = events.length ? events : null
    }

    // Call hook.
    await onFetchEvents?.(events, keyFilter)

    // If no events found, return undefined.
    if (!events.length) {
      return undefined
    }

    // Remove delete events.
    const undeletedEvents = events.filter((event) => !event.delete)

    // If events found, create map.
    const map: Record<string | number, any> = {}
    for (const event of undeletedEvents) {
      // Remove prefix from key and convert to expected format.
      const mapKey = numericKeys
        ? dbKeyToNumber(event.key.slice(keyPrefix.length))
        : dbKeyToString(event.key.slice(keyPrefix.length))

      map[mapKey] = JSON.parse(event.value ?? 'null')
    }

    return map
  }

  // Gets the date of the most recent event for the given key.
  const getDateKeyModified: FormulaDateGetter = async (
    contractAddress,
    ...keys
  ) => {
    const key = dbKeyForKeys(...keys)
    // Check cache.
    const cacheKey = `${contractAddress}:${key}`
    const cachedEvent = cache[cacheKey]

    // Get most recent event for this key.
    const event =
      // If undefined, we haven't tried to fetch it yet. If not undefined,
      // either it exists or it doesn't (null).
      cachedEvent !== undefined
        ? cachedEvent?.[0]
        : await Event.findOne({
            where: {
              contractAddress,
              key,
              ...blockHeightFilter,
            },
            order: [['blockHeight', 'DESC']],
          })

    // Cache event, null if nonexistent.
    if (cachedEvent === undefined) {
      cache[cacheKey] = event ? [event] : null
    }

    // Call hook.
    await onFetchEvents?.(event ? [event] : [], key)

    if (!event) {
      return undefined
    }

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(event.blockTimeUnixMs) / 1e3)
    return date
  }

  // Gets the date of the first set event for the given key.
  const getDateKeyFirstSet: FormulaDateGetter = async (
    contractAddress,
    ...keys
  ) => {
    const key = dbKeyForKeys(...keys)
    // Get first set event for this key.
    const event = await Event.findOne({
      where: {
        contractAddress,
        key,
        delete: false,
        ...blockHeightFilter,
      },
      order: [['blockHeight', 'ASC']],
    })

    // Call hook.
    await onFetchEvents?.(event ? [event] : [], key)

    if (!event) {
      return undefined
    }

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(event.blockTimeUnixMs) / 1e3)
    return date
  }

  const prefetch: FormulaPrefetch = async (contractAddress, ...listOfKeys) => {
    const keys = listOfKeys.map((key) =>
      typeof key === 'string' || typeof key === 'number'
        ? dbKeyForKeys(key)
        : !key.map
        ? dbKeyForKeys(...key.keys)
        : // If it's a map, we need to filter by the prefix, so add an empty key at the end so append a comma. Also add an empty key at the end so the name(s) are treated as a prefix. Prefixes have their lengths encoded in the key and are treated differently from the final key in the tuple.
          dbKeyForKeys(...key.keys, '') + ','
    )

    const nonMapKeys = keys.filter((_, index) => {
      const key = listOfKeys[index]
      return typeof key === 'string' || typeof key === 'number' || !key.map
    })
    const mapKeyPrefixes = keys.filter((_, index) => {
      const key = listOfKeys[index]
      return typeof key !== 'string' && typeof key !== 'number' && key.map
    })

    const nonMapKeyFilter =
      nonMapKeys.length > 0 ? { [Op.in]: nonMapKeys } : undefined
    const mapKeyFilter =
      mapKeyPrefixes.length > 0
        ? { [Op.regexp]: `^(${mapKeyPrefixes.join('|')}).+` }
        : undefined
    const keyFilter =
      nonMapKeyFilter && mapKeyFilter
        ? {
            [Op.or]: {
              ...nonMapKeyFilter,
              ...mapKeyFilter,
            },
          }
        : nonMapKeyFilter || mapKeyFilter || {}

    const events = await Event.findAll({
      attributes: [
        // DISTINCT ON is not directly supported by Sequelize, so we need to
        // cast to unknown and back to string to insert this at the beginning of
        // the query. This ensures we use the most recent version of the key.
        Sequelize.literal('DISTINCT ON("key") "key"') as unknown as string,
        'key',
        'contractAddress',
        'blockHeight',
        'blockTimeUnixMs',
        'value',
        'delete',
      ],
      where: {
        contractAddress,
        key: keyFilter,
        ...blockHeightFilter,
      },
      order: [
        // Needs to be first so we can use DISTINCT ON.
        ['key', 'ASC'],
        ['blockHeight', 'DESC'],
      ],
    })

    // Call hook.
    await onFetchEvents?.(events, keyFilter)

    nonMapKeys.forEach((key) => {
      // Find matching event for key.
      const event = events.find((event) => event.key === key)
      const cacheKey = `${contractAddress}:${key}`
      // If no event found or key deleted, cache null for nonexistent.
      cache[cacheKey] = !event || event.delete ? null : [event]
    })
    // Group events by key prefix for maps, and also cache separately.
    mapKeyPrefixes.forEach((keyPrefix) => {
      // Find matching events for key prefix.
      const eventsForPrefix = events.filter((event) =>
        event.key.startsWith(keyPrefix)
      )
      const cacheKey = `${contractAddress}:${keyPrefix}`
      // If no events found, cache null for nonexistent.
      cache[cacheKey] = eventsForPrefix.length ? eventsForPrefix : null

      // Cache events separately.
      eventsForPrefix.forEach((event) => {
        const cacheKey = `${contractAddress}:${event.key}`
        // If key deleted, cache null for nonexistent.
        cache[cacheKey] = event.delete ? null : [event]
      })
    })
  }

  return {
    contractAddress,
    block,
    get,
    getMap,
    getDateKeyModified,
    getDateKeyFirstSet,
    prefetch,
    args,
  }
}
