import { Op, Sequelize } from 'sequelize'

import { Event, Transformation } from '../db/models'
import {
  Block,
  Cache,
  Env,
  FormulaDateGetter,
  FormulaDateWithValueMatchGetter,
  FormulaGetter,
  FormulaMapGetter,
  FormulaPrefetch,
  FormulaTransformMatchesGetter,
  SetDependencies,
} from './types'
import {
  dbKeyForKeys,
  dbKeyToNumber,
  dbKeyToString,
  getDependentKey,
} from './utils'

// Generate environment for computation.
export const getEnv = (
  block: Block,
  args: Record<string, any>,
  dependencies: SetDependencies,
  onFetch?: (
    events: Event[],
    transformations: Transformation[]
  ) => void | Promise<void>,
  cache: Cache = {
    events: {},
    transformations: {},
  }
): Env<{}> => {
  // Most recent event at or below this block.
  const blockHeightFilter = {
    blockHeight: {
      [Op.lte]: block.height,
    },
  }

  const get: FormulaGetter = async (contractAddress, ...keys) => {
    const key = dbKeyForKeys(...keys)
    const dependentKey = getDependentKey(contractAddress, key)
    dependencies.events.add(dependentKey)

    // Check cache.
    const cachedEvent = cache.events[dependentKey]
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
      cache.events[dependentKey] = event ? [event] : null
    }

    // If no event found or key was deleted, return undefined.
    if (!event || event.delete) {
      return undefined
    }

    // Call hook.
    await onFetch?.(event ? [event] : [], [])

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
    const dependentKey = getDependentKey(contractAddress, keyPrefix)
    dependencies.events.add(dependentKey)

    // Check cache.
    const cachedEvents = cache.events[dependentKey]

    const events =
      // If undefined, we haven't tried to fetch them yet. If not undefined,
      // either they exist or they don't (null).
      cachedEvents !== undefined
        ? cachedEvents ?? []
        : await Event.findAll({
            attributes: [
              // DISTINCT ON is not directly supported by Sequelize, so we need
              // to cast to unknown and back to string to insert this at the
              // beginning of the query. This ensures we use the most recent
              // version of the key.
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
              key: {
                [Op.like]: `${keyPrefix}%`,
              },
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
      cache.events[dependentKey] = events.length ? events : null
    }

    // If no events found, return undefined.
    if (!events.length) {
      return undefined
    }

    // Call hook.
    await onFetch?.(events, [])

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
    const dependentKey = getDependentKey(contractAddress, key)
    dependencies.events.add(dependentKey)

    // Check cache.
    const cachedEvent = cache.events[dependentKey]

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
      cache.events[dependentKey] = event ? [event] : null
    }

    if (!event) {
      return undefined
    }

    // Call hook.
    await onFetch?.(event ? [event] : [], [])

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
    dependencies.events.add(getDependentKey(contractAddress, key))

    // The cache consists of the most recent events for each key, but this
    // fetches the first event, so we can't use the cache.

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

    if (!event) {
      return undefined
    }

    // Call hook.
    await onFetch?.(event ? [event] : [], [])

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(event.blockTimeUnixMs) / 1e3)
    return date
  }

  // Gets the date of the first set event for the given key containing the data.
  const getDateKeyFirstSetWithValueMatch: FormulaDateWithValueMatchGetter =
    async (contractAddress, keys, where) => {
      const key = dbKeyForKeys(...keys)
      dependencies.events.add(getDependentKey(contractAddress, key))

      // The cache consists of the most recent events for each key, but this
      // fetches the first event, so we can't use the cache.

      // Get first set event for this key.
      const event = await Event.findOne({
        where: {
          contractAddress,
          key,
          delete: false,
          valueJson: where,
          ...blockHeightFilter,
        },
        order: [['blockHeight', 'ASC']],
      })

      if (!event) {
        return undefined
      }

      // Call hook.
      await onFetch?.(event ? [event] : [], [])

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
    keys.forEach((key) =>
      dependencies.events.add(getDependentKey(contractAddress, key))
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
    await onFetch?.(events, [])

    nonMapKeys.forEach((key) => {
      // Find matching event for key.
      const event = events.find((event) => event.key === key)
      const dependentKey = getDependentKey(contractAddress, key)
      // If no event found or key deleted, cache null for nonexistent.
      cache.events[dependentKey] = !event || event.delete ? null : [event]
    })
    // Group events by key prefix for maps, and also cache separately.
    mapKeyPrefixes.forEach((keyPrefix) => {
      // Find matching events for key prefix.
      const eventsForPrefix = events.filter((event) =>
        event.key.startsWith(keyPrefix)
      )
      const dependentKey = getDependentKey(contractAddress, keyPrefix)
      // If no events found, cache null for nonexistent.
      cache.events[dependentKey] = eventsForPrefix.length
        ? eventsForPrefix
        : null

      // Cache events separately.
      eventsForPrefix.forEach((event) => {
        const dependentKey = getDependentKey(contractAddress, event.key)
        // If key deleted, cache null for nonexistent.
        cache.events[dependentKey] = event.delete ? null : [event]
      })
    })
  }

  const getTransformMatches: FormulaTransformMatchesGetter = async (
    contractAddress,
    nameLike,
    where
  ) => {
    const dependentKey = getDependentKey(contractAddress, nameLike)
    dependencies.transformations.add(dependentKey)

    // Check cache.
    const cachedTransformations = cache.transformations[dependentKey]
    const transformations =
      // If undefined, we haven't tried to fetch them yet. If not undefined,
      // either they exist or they don't (null).
      cachedTransformations !== undefined
        ? cachedTransformations ?? []
        : await Transformation.findAll({
            attributes: [
              // DISTINCT ON is not directly supported by Sequelize, so we need
              // to cast to unknown and back to string to insert this at the
              // beginning of the query. This ensures we use the most recent
              // version of the key for each contract.
              Sequelize.literal(
                'DISTINCT ON("name", "contractAddress") "name"'
              ) as unknown as string,
              'name',
              'contractAddress',
              'blockHeight',
              'blockTimeUnixMs',
              'value',
            ],
            where: {
              name: {
                [Op.like]: nameLike,
              },
              ...(contractAddress && {
                contractAddress,
              }),
              ...(where && {
                valueJson: where,
              }),
              ...blockHeightFilter,
            },
            order: [
              // Needs to be first so we can use DISTINCT ON.
              ['name', 'ASC'],
              ['contractAddress', 'ASC'],
              // Descending block height ensures we get the most recent event
              // for the (contractAddress,name) pair.
              ['blockHeight', 'DESC'],
            ],
          })

    // Cache transformations, null if nonexistent.
    if (cachedTransformations === undefined) {
      cache.transformations[dependentKey] = transformations.length
        ? transformations
        : null
    }

    // If no transformations found, return undefined.
    if (!transformations.length) {
      return undefined
    }

    // Call hook.
    await onFetch?.([], transformations)

    return transformations.map((transformation) => ({
      contractAddress: transformation.contractAddress,
      block: transformation.block,
      name: transformation.name,
      value: transformation.value as any,
    }))
  }

  return {
    block,
    get,
    getMap,
    getDateKeyModified,
    getDateKeyFirstSet,
    getDateKeyFirstSetWithValueMatch,
    getTransformMatches,
    prefetch,
    args,
  }
}
