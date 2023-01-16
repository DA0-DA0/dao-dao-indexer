import { Op, Sequelize } from 'sequelize'

import { Contract, Event, Transformation } from '@/db'

import { loadConfig } from './config'
import {
  Env,
  EnvOptions,
  FormulaCodeIdKeyForContractGetter,
  FormulaCodeIdsForKeysGetter,
  FormulaContractCodeIdGetter,
  FormulaContractMatchesCodeIdKeysGetter,
  FormulaDateGetter,
  FormulaDateWithValueMatchGetter,
  FormulaGetter,
  FormulaMapGetter,
  FormulaPrefetch,
  FormulaPrefetchTransformations,
  FormulaTransformationDateGetter,
  FormulaTransformationMapGetter,
  FormulaTransformationMatchGetter,
  FormulaTransformationMatchesGetter,
} from './types'
import {
  dbKeyForKeys,
  dbKeyToNumber,
  dbKeyToString,
  getDependentKey,
} from './utils'

// Generate environment for computation.
export const getEnv = ({
  block,
  useBlockDate = false,
  args = {},
  dependencies,
  onFetch,
  cache = {
    events: {},
    transformations: {},
    contracts: {},
  },
}: EnvOptions): Env<{}> => {
  // Most recent event at or below this block.
  const blockHeightFilter = {
    blockHeight: {
      [Op.lte]: block.height,
    },
  }

  const get: FormulaGetter = async (contractAddress, ...keys) => {
    const key = dbKeyForKeys(...keys)
    const dependentKey = getDependentKey(contractAddress, key)
    dependencies?.events.add(dependentKey)

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
    await onFetch?.([event], [])

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
    dependencies?.events.add(dependentKey)

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
                'DISTINCT ON("key") \'key\''
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
    dependencies?.events.add(dependentKey)

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
    await onFetch?.([event], [])

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
    dependencies?.events.add(getDependentKey(contractAddress, key))

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
    await onFetch?.([event], [])

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(event.blockTimeUnixMs) / 1e3)
    return date
  }

  // Gets the date of the first set event for the given key containing the data.
  const getDateKeyFirstSetWithValueMatch: FormulaDateWithValueMatchGetter =
    async (contractAddress, keys, where) => {
      const key = dbKeyForKeys(...keys)
      dependencies?.events.add(getDependentKey(contractAddress, key))

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
      await onFetch?.([event], [])

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
      dependencies?.events.add(getDependentKey(contractAddress, key))
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
        Sequelize.literal('DISTINCT ON("key") \'key\'') as unknown as string,
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

  const getTransformationMatches: FormulaTransformationMatchesGetter = async (
    contractAddress,
    nameLike,
    where,
    whereCodeId
  ) => {
    const dependentKey = getDependentKey(contractAddress, nameLike)
    dependencies?.transformations.add(dependentKey)

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
              // version of the name for each contract.
              Sequelize.literal(
                'DISTINCT ON("name", "contractAddress") \'name\''
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
                value: where,
              }),
              ...blockHeightFilter,
            },
            order: [
              // Needs to be first so we can use DISTINCT ON.
              ['name', 'ASC'],
              ['contractAddress', 'ASC'],
              // Descending block height ensures we get the most recent
              // transformation for the (contractAddress,name) pair.
              ['blockHeight', 'DESC'],
            ],
            include: [
              {
                model: Contract,
                required: true,
                where: whereCodeId && {
                  codeId: whereCodeId,
                },
              },
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
      codeId: transformation.contract.codeId,
      name: transformation.name,
      value: transformation.value as any,
    }))
  }

  const getTransformationMatch: FormulaTransformationMatchGetter = async (
    ...params
  ) => (await getTransformationMatches<any>(...params))?.[0]

  const getTransformationMap: FormulaTransformationMapGetter = async (
    contractAddress,
    namePrefix
  ) => {
    const mapNamePrefix = namePrefix + ':'
    const dependentKey = getDependentKey(contractAddress, mapNamePrefix)
    dependencies?.transformations.add(dependentKey)

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
              // version of the name for each contract.
              Sequelize.literal(
                'DISTINCT ON("name") \'name\''
              ) as unknown as string,
              'name',
              'contractAddress',
              'blockHeight',
              'blockTimeUnixMs',
              'value',
            ],
            where: {
              contractAddress,
              name: {
                [Op.like]: mapNamePrefix + '%',
              },
              ...blockHeightFilter,
            },
            order: [
              // Needs to be first so we can use DISTINCT ON.
              ['name', 'ASC'],
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

    // Remove empty values.
    const definedTransformations = transformations.filter(
      (transformation) => transformation.value !== null
    )

    // If transformations found, create map.
    const map: Record<string | number, any> = {}
    for (const transformation of definedTransformations) {
      map[transformation.name.slice(mapNamePrefix.length)] =
        transformation.value
    }

    return map
  }

  const prefetchTransformations: FormulaPrefetchTransformations = async (
    contractAddress,
    listOfNames
  ) => {
    const names = listOfNames.map((name) =>
      typeof name === 'string'
        ? name
        : // If it's a map, we need to filter by the prefix, so add a colon to indicate it's a map prefix.
          name.name + ':'
    )
    names.forEach((key) =>
      dependencies?.transformations.add(getDependentKey(contractAddress, key))
    )

    const nonMapNames = names.filter((_, index) => {
      const key = listOfNames[index]
      return typeof key === 'string'
    })
    const mapNamePrefixes = names.filter((_, index) => {
      const key = listOfNames[index]
      return typeof key !== 'string' && key.map
    })

    const nonMapNameFilter =
      nonMapNames.length > 0 ? { [Op.in]: nonMapNames } : undefined
    const mapNameFilter =
      mapNamePrefixes.length > 0
        ? {
            [Op.or]: mapNamePrefixes.map((prefix) => ({
              [Op.like]: prefix + '%',
            })),
          }
        : undefined
    const nameFilter =
      nonMapNameFilter && mapNameFilter
        ? {
            [Op.or]: [nonMapNameFilter, ...mapNameFilter[Op.or]],
          }
        : nonMapNameFilter || mapNameFilter || {}

    const transformations = await Transformation.findAll({
      attributes: [
        // DISTINCT ON is not directly supported by Sequelize, so we need to
        // cast to unknown and back to string to insert this at the beginning of
        // the query. This ensures we use the most recent version of the name
        // for each contract.
        Sequelize.literal('DISTINCT ON("name") \'name\'') as unknown as string,
        'name',
        'contractAddress',
        'blockHeight',
        'blockTimeUnixMs',
        'value',
      ],
      where: {
        contractAddress,
        name: nameFilter,
        ...blockHeightFilter,
      },
      order: [
        // Needs to be first so we can use DISTINCT ON.
        ['name', 'ASC'],
        ['blockHeight', 'DESC'],
      ],
    })

    // Call hook.
    await onFetch?.([], transformations)

    nonMapNames.forEach((name) => {
      // Find matching transformation for name.
      const transformation = transformations.find(
        (transformation) => transformation.name === name
      )
      const dependentKey = getDependentKey(contractAddress, name)
      // If no transformation found or value null, cache null for nonexistent.
      cache.transformations[dependentKey] =
        !transformation || transformation.value === null
          ? null
          : [transformation]
    })
    // Group transformations by name prefix for maps, and also cache separately.
    mapNamePrefixes.forEach((mapNamePrefix) => {
      // Find matching transformations for name prefix.
      const transformationsForPrefix = transformations.filter(
        (transformation) => transformation.name.startsWith(mapNamePrefix)
      )
      const dependentKey = getDependentKey(contractAddress, mapNamePrefix)
      // If no transformations found, cache null for nonexistent.
      cache.transformations[dependentKey] = transformationsForPrefix.length
        ? transformationsForPrefix
        : null

      // Cache transformations separately.
      transformationsForPrefix.forEach((transformation) => {
        const dependentKey = getDependentKey(
          contractAddress,
          transformation.name
        )
        // If key deleted, cache null for nonexistent.
        cache.transformations[dependentKey] =
          transformation.value === null ? null : [transformation]
      })
    })
  }

  // Gets the date of the first transformation for the given name.
  const getDateFirstTransformed: FormulaTransformationDateGetter = async (
    contractAddress,
    nameLike,
    where
  ) => {
    dependencies?.transformations.add(
      getDependentKey(contractAddress, nameLike)
    )

    // The cache consists of the most recent transformations for each name, but
    // this fetches the first transformation, so we can't use the cache.

    // Get first transformation for this name.
    const transformation = await Transformation.findOne({
      where: {
        name: {
          [Op.like]: nameLike,
        },
        ...(contractAddress && {
          contractAddress,
        }),
        ...(where && {
          value: where,
        }),
        ...blockHeightFilter,
      },
      order: [['blockHeight', 'ASC']],
    })

    if (!transformation) {
      return undefined
    }

    // Call hook.
    await onFetch?.([], [transformation])

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(transformation.blockTimeUnixMs) / 1e3)
    return date
  }

  const getContractCodeId: FormulaContractCodeIdGetter = async (
    contractAddress
  ) => {
    // Get contract from cache.
    const cachedContract = cache.contracts[contractAddress]

    // If found contract, return code ID.
    if (cachedContract) {
      return cachedContract.codeId
    }
    // If contract was previously found to not exist, return undefined.
    else if (cachedContract === null) {
      return
    }

    // Find contract in database.
    const contract = await Contract.findOne({
      where: {
        address: contractAddress,
      },
    })

    // Cache contract.
    cache.contracts[contractAddress] = contract

    return contract?.codeId
  }

  // Get code ID key map from config.
  const config = loadConfig()
  const getCodeIdsForKeys: FormulaCodeIdsForKeysGetter = (...keys) =>
    keys.flatMap((key) => config.codeIds?.[key] ?? [])

  const contractMatchesCodeIdKeys: FormulaContractMatchesCodeIdKeysGetter =
    async (contractAddress, ...keys) => {
      const codeId = await getContractCodeId(contractAddress)
      return codeId !== undefined && getCodeIdsForKeys(...keys).includes(codeId)
    }

  // Tries to find the code ID of this contract in the code ID keys and returns
  // the first match.
  const getCodeIdKeyForContract: FormulaCodeIdKeyForContractGetter = async (
    contractAddress
  ) => {
    const codeId = await getContractCodeId(contractAddress)
    if (codeId === undefined) {
      return
    }

    const codeIdKeys = Object.entries(config.codeIds ?? {}).flatMap(
      ([key, value]) => (value?.includes(codeId) ? [key] : [])
    )
    return codeIdKeys[0]
  }

  return {
    block,
    date: useBlockDate ? new Date(block.timeUnixMs) : new Date(),
    args,

    get,
    getMap,
    getDateKeyModified,
    getDateKeyFirstSet,
    getDateKeyFirstSetWithValueMatch,
    getTransformationMatch,
    getTransformationMatches,
    getTransformationMap,
    getDateFirstTransformed,
    prefetch,
    prefetchTransformations,
    getContractCodeId,
    getCodeIdsForKeys,
    contractMatchesCodeIdKeys,
    getCodeIdKeyForContract,
  }
}
