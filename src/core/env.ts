import { Op, QueryTypes, Sequelize } from 'sequelize'

import {
  BankStateEvent,
  Contract,
  DistributionCommunityPoolStateEvent,
  GovStateEvent,
  StakingSlashEvent,
  WasmStateEvent,
  WasmStateEventTransformation,
  WasmTxEvent,
  loadDb,
} from '@/db'
import { WasmCodeService } from '@/services/wasm-codes'

import {
  Cache,
  DbType,
  Env,
  EnvOptions,
  FormulaBalanceGetter,
  FormulaBalancesGetter,
  FormulaCodeIdKeyForContractGetter,
  FormulaCommunityPoolBalancesGetter,
  FormulaContractGetter,
  FormulaContractMatchesCodeIdKeysGetter,
  FormulaDateGetter,
  FormulaDateWithValueMatchGetter,
  FormulaGetter,
  FormulaMapGetter,
  FormulaPrefetch,
  FormulaPrefetchTransformations,
  FormulaProposalCountGetter,
  FormulaProposalGetter,
  FormulaProposalObject,
  FormulaProposalsGetter,
  FormulaQuerier,
  FormulaSlashEventsGetter,
  FormulaTransformationDateGetter,
  FormulaTransformationMapGetter,
  FormulaTransformationMatchGetter,
  FormulaTransformationMatchesGetter,
  FormulaTxEventsGetter,
} from './types'
import { dbKeyForKeys, dbKeyToKeys, getDependentKey } from './utils'

// Generate environment for computation.
export const getEnv = ({
  chainId,
  block,
  useBlockDate = false,
  args = {},
  dependentKeys,
  onFetch,
  cache: _cache,
}: EnvOptions): Env<{}> => {
  const cache: Cache = {
    events: {},
    contracts: {},
    ..._cache,
  }

  // Most recent event at or below this block.
  const blockHeightFilter = {
    [Op.lte]: block.height,
  }

  const get: FormulaGetter = async (contractAddress, ...keys) => {
    const key = dbKeyForKeys(...keys)
    const dependentKey = getDependentKey(
      WasmStateEvent.dependentKeyNamespace,
      contractAddress,
      key
    )
    dependentKeys?.push({
      key: dependentKey,
      prefix: false,
    })

    // Check cache.
    const cachedEvent = cache.events[dependentKey]
    const event =
      // If undefined, we haven't tried to fetch it yet. If not undefined,
      // either it exists or it doesn't (null).
      cachedEvent !== undefined
        ? cachedEvent?.[0]
        : await WasmStateEvent.findOne({
            where: {
              contractAddress,
              key,
              blockHeight: blockHeightFilter,
            },
            order: [['blockHeight', 'DESC']],
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (event && !(event instanceof WasmStateEvent)) {
      throw new Error('Incorrect event type.')
    }

    // Cache event, null if nonexistent.
    if (cachedEvent === undefined) {
      cache.events[dependentKey] = event ? [event] : null
    }

    // If no event found, return undefined.
    if (!event) {
      return
    }

    // Call hook, even if event deleted.
    await onFetch?.([event])

    // If key was deleted, return undefined.
    if (event.delete) {
      return
    }

    const value = JSON.parse(event.value ?? 'null')

    return value
  }

  const getMap: FormulaMapGetter = async (
    contractAddress,
    name,
    { keyType = 'string' } = {}
  ) => {
    const keyPrefix =
      (Array.isArray(name)
        ? // Add an empty key at the end so the name(s) are treated as a prefix. Prefixes have their lengths encoded in the key and are treated differently from the final key in the tuple.
          dbKeyForKeys(...name, '')
        : dbKeyForKeys(name, '')) + ','
    const dependentKey = getDependentKey(
      WasmStateEvent.dependentKeyNamespace,
      contractAddress,
      keyPrefix
    )
    dependentKeys?.push({
      key: dependentKey,
      prefix: true,
    })

    // Check cache.
    const cachedEvents = cache.events[dependentKey]

    const events =
      // If undefined, we haven't tried to fetch them yet. If not undefined,
      // either they exist or they don't (null).
      cachedEvents !== undefined
        ? ((cachedEvents ?? []) as WasmStateEvent[])
        : await WasmStateEvent.findAll({
            attributes: [
              // DISTINCT ON is not directly supported by Sequelize, so we need
              // to cast to unknown and back to string to insert this at the
              // beginning of the query. This ensures we use the most recent
              // version of the key.
              Sequelize.literal('DISTINCT ON("key") \'\'') as unknown as string,
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
              blockHeight: blockHeightFilter,
            },
            order: [
              // Needs to be first so we can use DISTINCT ON.
              ['key', 'ASC'],
              ['blockHeight', 'DESC'],
            ],
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (events.some((event) => !(event instanceof WasmStateEvent))) {
      throw new Error('Incorrect event type.')
    }

    // Cache events, null if nonexistent.
    if (cachedEvents === undefined) {
      cache.events[dependentKey] = events.length ? events : null
    }

    // If no events found, return undefined.
    if (!events.length) {
      return undefined
    }

    // Call hook.
    await onFetch?.(events)

    // Remove delete events.
    const undeletedEvents = events.filter((event) => !event.delete)

    // If events found, create map.
    const map: Record<string | number, any> = {}
    for (const event of undeletedEvents) {
      // Remove prefix from key and decode into expected format.
      const mapKey =
        keyType === 'string'
          ? dbKeyToKeys(event.key.slice(keyPrefix.length), [false])[0]
          : keyType === 'number'
          ? dbKeyToKeys(event.key.slice(keyPrefix.length), [true])[0]
          : // keyType === 'raw'
            event.key.slice(keyPrefix.length)

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
    const dependentKey = getDependentKey(
      WasmStateEvent.dependentKeyNamespace,
      contractAddress,
      key
    )
    dependentKeys?.push({
      key: dependentKey,
      prefix: false,
    })

    // Check cache.
    const cachedEvent = cache.events[dependentKey]

    // Get most recent event for this key.
    const event =
      // If undefined, we haven't tried to fetch it yet. If not undefined,
      // either it exists or it doesn't (null).
      cachedEvent !== undefined
        ? cachedEvent?.[0]
        : await WasmStateEvent.findOne({
            where: {
              contractAddress,
              key,
              blockHeight: blockHeightFilter,
            },
            order: [['blockHeight', 'DESC']],
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (event && !(event instanceof WasmStateEvent)) {
      throw new Error('Incorrect event type.')
    }

    // Cache event, null if nonexistent.
    if (cachedEvent === undefined) {
      cache.events[dependentKey] = event ? [event] : null
    }

    if (!event) {
      return undefined
    }

    // Call hook.
    await onFetch?.([event])

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
    dependentKeys?.push({
      key: getDependentKey(
        WasmStateEvent.dependentKeyNamespace,
        contractAddress,
        key
      ),
      prefix: false,
    })

    // The cache consists of the most recent events for each key, but this
    // fetches the first event, so we can't use the cache.

    // Get first set event for this key.
    const event = await WasmStateEvent.findOne({
      where: {
        contractAddress,
        key,
        delete: false,
        blockHeight: blockHeightFilter,
      },
      order: [['blockHeight', 'ASC']],
    })

    if (!event) {
      return undefined
    }

    // Call hook.
    await onFetch?.([event])

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(event.blockTimeUnixMs) / 1e3)
    return date
  }

  // Gets the date of the first set event for the given key containing the data.
  const getDateKeyFirstSetWithValueMatch: FormulaDateWithValueMatchGetter =
    async (contractAddress, keys, where) => {
      const key = dbKeyForKeys(...keys)
      dependentKeys?.push({
        key: getDependentKey(
          WasmStateEvent.dependentKeyNamespace,
          contractAddress,
          key
        ),
        prefix: false,
      })

      // The cache consists of the most recent events for each key, but this
      // fetches the first event, so we can't use the cache.

      // Get first set event for this key.
      const event = await WasmStateEvent.findOne({
        where: {
          contractAddress,
          key,
          delete: false,
          valueJson: where,
          blockHeight: blockHeightFilter,
        },
        order: [['blockHeight', 'ASC']],
      })

      if (!event) {
        return undefined
      }

      // Call hook.
      await onFetch?.([event])

      // Convert block time to date.
      const date = new Date(0)
      date.setUTCSeconds(Number(event.blockTimeUnixMs) / 1e3)
      return date
    }

  const prefetch: FormulaPrefetch = async (contractAddress, ...listOfKeys) => {
    const keys = listOfKeys.map((key) =>
      typeof key === 'string' ||
      typeof key === 'number' ||
      key instanceof Uint8Array
        ? dbKeyForKeys(key)
        : !key.map
        ? dbKeyForKeys(...key.keys)
        : // If it's a map, we need to filter by the prefix, so add an empty key at the end and append a comma. Also add an empty key at the end so the name(s) are treated as a prefix. Prefixes have their lengths encoded in the key and are treated differently from the final key in the tuple.
          dbKeyForKeys(...key.keys, '') + ','
    )
    keys.forEach((key) =>
      dependentKeys?.push({
        key: getDependentKey(
          WasmStateEvent.dependentKeyNamespace,
          contractAddress,
          key
        ),
        prefix: key.endsWith(','),
      })
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

    const events = await WasmStateEvent.findAll({
      attributes: [
        // DISTINCT ON is not directly supported by Sequelize, so we need to
        // cast to unknown and back to string to insert this at the beginning of
        // the query. This ensures we use the most recent version of the key.
        Sequelize.literal('DISTINCT ON("key") \'\'') as unknown as string,
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
        blockHeight: blockHeightFilter,
      },
      order: [
        // Needs to be first so we can use DISTINCT ON.
        ['key', 'ASC'],
        ['blockHeight', 'DESC'],
      ],
    })

    // Call hook.
    await onFetch?.(events)

    nonMapKeys.forEach((key) => {
      // Find matching event for key.
      const event = events.find((event) => event.key === key)
      const dependentKey = getDependentKey(
        WasmStateEvent.dependentKeyNamespace,
        contractAddress,
        key
      )
      // If no event found or key deleted, cache null for nonexistent.
      cache.events[dependentKey] = !event || event.delete ? null : [event]
    })
    // Group events by key prefix for maps, and also cache separately.
    mapKeyPrefixes.forEach((keyPrefix) => {
      // Find matching events for key prefix.
      const eventsForPrefix = events.filter((event) =>
        event.key.startsWith(keyPrefix)
      )
      const dependentKey = getDependentKey(
        WasmStateEvent.dependentKeyNamespace,
        contractAddress,
        keyPrefix
      )
      // If no events found, cache null for nonexistent.
      cache.events[dependentKey] = eventsForPrefix.length
        ? eventsForPrefix
        : null

      // Cache events separately.
      eventsForPrefix.forEach((event) => {
        const dependentKey = getDependentKey(
          WasmStateEvent.dependentKeyNamespace,
          contractAddress,
          event.key
        )
        // If key deleted, cache null for nonexistent.
        cache.events[dependentKey] = event.delete ? null : [event]
      })
    })
  }

  const getTransformationMatches: FormulaTransformationMatchesGetter = async (
    contractAddress,
    nameLike,
    where,
    whereCodeId,
    whereName,
    limit
  ) => {
    const dependentKey = getDependentKey(
      WasmStateEventTransformation.dependentKeyNamespace,
      contractAddress,
      nameLike
    )
    dependentKeys?.push({
      key: dependentKey,
      prefix: false,
    })

    // Columns we need to include in the DISTINCT ON clause.
    const distinctOn = [
      'name',
      // We only need to add contractAddress to the DISTINCT ON clause if it's
      // not defined. If it's defined, all fetched rows will be for the same
      // contract. Otherwise, we retrieve all contracts matching the name and
      // need to make sure only one name per contract is returned.
      ...(contractAddress ? [] : ['contractAddress']),
    ]

    // Check cache.
    const cachedTransformations = cache.events[dependentKey]
    let transformations =
      // If undefined, we haven't tried to fetch them yet. If not undefined,
      // either they exist or they don't (null).
      cachedTransformations !== undefined
        ? ((cachedTransformations ?? []) as WasmStateEventTransformation[])
        : await WasmStateEventTransformation.findAll({
            attributes: [
              // DISTINCT ON is not directly supported by Sequelize, so we need
              // to cast to unknown and back to string to insert this at the
              // beginning of the query. This ensures we use the most recent
              // version of the name for each contract.
              Sequelize.literal(
                `DISTINCT ON("${distinctOn.join('", "')}") ''`
              ) as unknown as string,
              'id',
              'name',
              'contractAddress',
              'blockHeight',
              'blockTimeUnixMs',
              'value',
            ],
            where: {
              name: {
                // Replace * with % for LIKE query.
                [Op.like]: nameLike.replace(/\*/g, '%'),
                ...whereName,
              },
              ...(contractAddress && {
                contractAddress,
              }),
              ...(where && {
                value: where,
              }),
              blockHeight: blockHeightFilter,
            },
            limit,
            order: [
              // Needs to be first so we can use DISTINCT ON.
              ...distinctOn.map((key) => [key, 'ASC'] as [string, 'ASC']),
              // Descending block height ensures we get the most recent
              // transformation for the (contractAddress, name) pair.
              ['blockHeight', 'DESC'],
            ],
            include: [
              {
                model: Contract,
                required: true,
              },
            ],
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (
      transformations.some(
        (transformation) =>
          !(transformation instanceof WasmStateEventTransformation)
      )
    ) {
      throw new Error('Incorrect event type.')
    }

    // Cache transformations, null if nonexistent.
    if (cachedTransformations === undefined) {
      cache.events[dependentKey] = transformations.length
        ? transformations
        : null
    }

    // Filter by contract code IDs. We need to do this after the query since we
    // cache only based on transformation event name. If a single formula
    // queries the same name twice with different code ID filters, the first one
    // will cache all the events, so we can't filter by code ID in the query.
    if (whereCodeId) {
      transformations = whereCodeId.length
        ? transformations.filter((transformation) =>
            whereCodeId.includes(transformation.contract.codeId)
          )
        : []
    }

    // If no transformations found, return undefined.
    if (!transformations.length) {
      return undefined
    }

    // Call hook.
    await onFetch?.(transformations)

    return transformations.map((transformation) => ({
      block: transformation.block,
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
    const dependentKey = getDependentKey(
      WasmStateEventTransformation.dependentKeyNamespace,
      contractAddress,
      mapNamePrefix
    )
    dependentKeys?.push({
      key: dependentKey,
      prefix: true,
    })

    // Check cache.
    const cachedTransformations = cache.events[dependentKey]
    const transformations =
      // If undefined, we haven't tried to fetch them yet. If not undefined,
      // either they exist or they don't (null).
      cachedTransformations !== undefined
        ? ((cachedTransformations ?? []) as WasmStateEventTransformation[])
        : await WasmStateEventTransformation.findAll({
            attributes: [
              // DISTINCT ON is not directly supported by Sequelize, so we need
              // to cast to unknown and back to string to insert this at the
              // beginning of the query. This ensures we use the most recent
              // version of the name for each contract.
              Sequelize.literal(
                'DISTINCT ON("name") \'\''
              ) as unknown as string,
              'id',
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
              blockHeight: blockHeightFilter,
            },
            order: [
              // Needs to be first so we can use DISTINCT ON.
              ['name', 'ASC'],
              ['blockHeight', 'DESC'],
            ],
            include: Contract,
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (
      transformations.some(
        (transformation) =>
          !(transformation instanceof WasmStateEventTransformation)
      )
    ) {
      throw new Error('Incorrect event type.')
    }

    // Cache transformations, null if nonexistent.
    if (cachedTransformations === undefined) {
      cache.events[dependentKey] = transformations.length
        ? transformations
        : null
    }

    // If no transformations found, return undefined.
    if (!transformations.length) {
      return undefined
    }

    // Call hook.
    await onFetch?.(transformations)

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
      dependentKeys?.push({
        key: getDependentKey(
          WasmStateEventTransformation.dependentKeyNamespace,
          contractAddress,
          key
        ),
        prefix: key.endsWith(':'),
      })
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

    const transformations = await WasmStateEventTransformation.findAll({
      attributes: [
        // DISTINCT ON is not directly supported by Sequelize, so we need to
        // cast to unknown and back to string to insert this at the beginning of
        // the query. This ensures we use the most recent version of the name
        // for each contract.
        Sequelize.literal('DISTINCT ON("name") \'\'') as unknown as string,
        'id',
        'name',
        'contractAddress',
        'blockHeight',
        'blockTimeUnixMs',
        'value',
      ],
      where: {
        contractAddress,
        name: nameFilter,
        blockHeight: blockHeightFilter,
      },
      order: [
        // Needs to be first so we can use DISTINCT ON.
        ['name', 'ASC'],
        ['blockHeight', 'DESC'],
      ],
      include: Contract,
    })

    // Call hook.
    await onFetch?.([])

    nonMapNames.forEach((name) => {
      // Find matching transformation for name.
      const transformation = transformations.find(
        (transformation) => transformation.name === name
      )
      const dependentKey = getDependentKey(
        WasmStateEventTransformation.dependentKeyNamespace,
        contractAddress,
        name
      )
      // If no transformation found or value null, cache null for nonexistent.
      cache.events[dependentKey] =
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
      const dependentKey = getDependentKey(
        WasmStateEventTransformation.dependentKeyNamespace,
        contractAddress,
        mapNamePrefix
      )
      // If no transformations found, cache null for nonexistent.
      cache.events[dependentKey] = transformationsForPrefix.length
        ? transformationsForPrefix
        : null

      // Cache transformations separately.
      transformationsForPrefix.forEach((transformation) => {
        const dependentKey = getDependentKey(
          WasmStateEventTransformation.dependentKeyNamespace,
          contractAddress,
          transformation.name
        )
        // If key deleted, cache null for nonexistent.
        cache.events[dependentKey] =
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
    dependentKeys?.push({
      key: getDependentKey(
        WasmStateEventTransformation.dependentKeyNamespace,
        contractAddress,
        nameLike
      ),
      prefix: false,
    })

    // The cache consists of the most recent transformations for each name, but
    // this fetches the first transformation, so we can't use the cache.

    // Get first transformation for this name.
    const transformation = await WasmStateEventTransformation.findOne({
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
        blockHeight: blockHeightFilter,
      },
      order: [['blockHeight', 'ASC']],
    })

    if (!transformation) {
      return undefined
    }

    // Call hook.
    await onFetch?.([transformation])

    // Convert block time to date.
    const date = new Date(0)
    date.setUTCSeconds(Number(transformation.blockTimeUnixMs) / 1e3)
    return date
  }

  const getContract: FormulaContractGetter = async (contractAddress) => {
    // Get contract from cache.
    const cachedContract = cache.contracts[contractAddress]

    // If found contract, return contract.
    if (cachedContract) {
      return cachedContract.json
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

    return contract?.json
  }

  const getCodeIdsForKeys = (...keys: string[]): number[] =>
    WasmCodeService.getInstance().findWasmCodeIdsByKeys(...keys)

  const contractMatchesCodeIdKeys: FormulaContractMatchesCodeIdKeysGetter =
    async (contractAddress, ...keys) => {
      const codeId = (await getContract(contractAddress))?.codeId
      return codeId !== undefined && getCodeIdsForKeys(...keys).includes(codeId)
    }

  // Tries to find the code ID of this contract in the code ID keys and returns
  // the first match.
  const getCodeIdKeyForContract: FormulaCodeIdKeyForContractGetter = async (
    contractAddress
  ) => {
    const codeId = (await getContract(contractAddress))?.codeId
    if (codeId === undefined) {
      return
    }

    return WasmCodeService.getInstance().findWasmCodeKeysById(codeId)[0]
  }

  const getSlashEvents: FormulaSlashEventsGetter = async (
    validatorOperatorAddress
  ) => {
    const dependentKey = getDependentKey(
      StakingSlashEvent.dependentKeyNamespace,
      validatorOperatorAddress
    )
    dependentKeys?.push({
      key: dependentKey,
      prefix: true,
    })

    // Check cache.
    const cached = cache.events[dependentKey]
    const slashEvents =
      // If undefined, we haven't tried to fetch them yet. If not undefined,
      // either they exist or they don't (null).
      cached !== undefined
        ? ((cached ?? []) as StakingSlashEvent[])
        : await StakingSlashEvent.findAll({
            where: {
              validatorOperatorAddress,
              registeredBlockHeight: blockHeightFilter,
            },
            order: [['registeredBlockHeight', 'DESC']],
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (
      slashEvents.some(
        (slashEvent) => !(slashEvent instanceof StakingSlashEvent)
      )
    ) {
      throw new Error('Incorrect event type.')
    }

    // Cache transformations, null if nonexistent.
    if (cached === undefined) {
      cache.events[dependentKey] = slashEvents.length ? slashEvents : null
    }

    // If no transformations found, return undefined.
    if (!slashEvents.length) {
      return undefined
    }

    // Call hook.
    await onFetch?.(slashEvents)

    return slashEvents.map((slashEvent) => slashEvent.toJSON())
  }

  const getTxEvents: FormulaTxEventsGetter = async (contractAddress, where) => {
    // Add dependent key for any TX events for this contract. Thus a formula
    // will be recomputed whenever a new TX event occurs for this contract.
    dependentKeys?.push({
      key: getDependentKey(WasmTxEvent.dependentKeyNamespace, contractAddress),
      prefix: true,
    })

    const txEvents = await WasmTxEvent.findAll({
      where: {
        ...where,

        contractAddress,
        blockHeight: blockHeightFilter,
      },
      order: [['blockHeight', 'DESC']],
    })

    // If no transformations found, return undefined.
    if (!txEvents.length) {
      return undefined
    }

    return txEvents.map((txEvent) => txEvent.toJSON())
  }

  const getBalance: FormulaBalanceGetter = async (address, denom) => {
    const dependentKey = getDependentKey(
      BankStateEvent.dependentKeyNamespace,
      address,
      denom
    )
    dependentKeys?.push({
      key: dependentKey,
      prefix: false,
    })

    // Check cache.
    const cachedEvent = cache.events[dependentKey]
    const event =
      // If undefined, we haven't tried to fetch it yet. If not undefined,
      // either it exists or it doesn't (null).
      cachedEvent !== undefined
        ? cachedEvent?.[0]
        : await BankStateEvent.findOne({
            where: {
              address,
              denom,
              blockHeight: blockHeightFilter,
            },
            order: [['blockHeight', 'DESC']],
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (event && !(event instanceof BankStateEvent)) {
      throw new Error('Incorrect event type.')
    }

    // Cache event, null if nonexistent.
    if (cachedEvent === undefined) {
      cache.events[dependentKey] = event ? [event] : null
    }

    // If no event found, return undefined.
    if (!event) {
      return
    }

    // Call hook.
    await onFetch?.([event])

    return event.balance
  }

  const getBalances: FormulaBalancesGetter = async (address) => {
    const dependentKey =
      getDependentKey(BankStateEvent.dependentKeyNamespace, address) + ':'
    dependentKeys?.push({
      key: dependentKey,
      prefix: true,
    })

    // Check cache.
    const cachedEvents = cache.events[dependentKey]

    const events =
      // If undefined, we haven't tried to fetch them yet. If not undefined,
      // either they exist or they don't (null).
      cachedEvents !== undefined
        ? ((cachedEvents ?? []) as BankStateEvent[])
        : await BankStateEvent.findAll({
            attributes: [
              // DISTINCT ON is not directly supported by Sequelize, so we need
              // to cast to unknown and back to string to insert this at the
              // beginning of the query. This ensures we use the most recent
              // version of each denom.
              Sequelize.literal(
                'DISTINCT ON("denom") \'\''
              ) as unknown as string,
              'denom',
              'address',
              'blockHeight',
              'blockTimeUnixMs',
              'balance',
            ],
            where: {
              address,
              blockHeight: blockHeightFilter,
            },
            order: [
              // Needs to be first so we can use DISTINCT ON.
              ['denom', 'ASC'],
              ['blockHeight', 'DESC'],
            ],
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (events.some((event) => !(event instanceof BankStateEvent))) {
      throw new Error('Incorrect event type.')
    }

    // Cache events, null if nonexistent.
    if (cachedEvents === undefined) {
      cache.events[dependentKey] = events.length ? events : null
    }

    // If no events found, return undefined.
    if (!events.length) {
      return
    }

    // Call hook.
    await onFetch?.(events)

    // Create denom balance map.
    return events.reduce(
      (acc, { denom, balance }) => ({
        ...acc,
        [denom]: balance,
      }),
      {} as Record<string, string>
    )
  }

  const getProposal: FormulaProposalGetter = async (proposalId) => {
    const dependentKey = getDependentKey(
      GovStateEvent.dependentKeyNamespace,
      proposalId
    )
    dependentKeys?.push({
      key: dependentKey,
      prefix: false,
    })

    // Check cache.
    const cachedEvent = cache.events[dependentKey]
    const event =
      // If undefined, we haven't tried to fetch it yet. If not undefined,
      // either it exists or it doesn't (null).
      cachedEvent !== undefined
        ? cachedEvent?.[0]
        : await GovStateEvent.findOne({
            where: {
              proposalId,
              blockHeight: blockHeightFilter,
            },
            order: [['blockHeight', 'DESC']],
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (event && !(event instanceof GovStateEvent)) {
      throw new Error('Incorrect event type.')
    }

    // Cache event, null if nonexistent.
    if (cachedEvent === undefined) {
      cache.events[dependentKey] = event ? [event] : null
    }

    // If no event found, return undefined.
    if (!event) {
      return
    }

    // Call hook.
    await onFetch?.([event])

    return {
      id: event.proposalId,
      data: event.data,
    }
  }

  const getProposals: FormulaProposalsGetter = async (
    ascending = false,
    limit = undefined,
    offset = 0
  ) => {
    const dependentKey =
      getDependentKey(GovStateEvent.dependentKeyNamespace) + ':'
    dependentKeys?.push({
      key: dependentKey,
      prefix: true,
    })

    // Check cache.
    const cachedEvents = cache.events[dependentKey]

    const events =
      // If undefined, we haven't tried to fetch them yet. If not undefined,
      // either they exist or they don't (null).
      cachedEvents !== undefined
        ? ((cachedEvents ?? []) as GovStateEvent[])
        : // Only load ID, proposal ID, and block height, so we can filter
          // properly before loading all data. This must match the query in
          // `getProposalCount` since it uses the same cache key.
          await GovStateEvent.findAll({
            attributes: [
              // DISTINCT ON is not directly supported by Sequelize, so we need
              // to cast to unknown and back to string to insert this at the
              // beginning of the query. This ensures we use the most recent
              // version of each proposal.
              Sequelize.literal(
                'DISTINCT ON("proposalId") \'\''
              ) as unknown as string,
              'proposalId',
              'id',
              'blockHeight',
              'blockTimeUnixMs',
            ],
            where: {
              blockHeight: blockHeightFilter,
            },
            order: [
              // Needs to be first so we can use DISTINCT ON.
              ['proposalId', 'ASC'],
              ['blockHeight', 'DESC'],
            ],
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (events.some((event) => !(event instanceof GovStateEvent))) {
      throw new Error('Incorrect event type.')
    }

    // Cache events, null if nonexistent.
    if (cachedEvents === undefined) {
      cache.events[dependentKey] = events.length ? events : null
    }

    // Filter events before fetching data.
    const filteredEvents = events
      .sort(
        ascending
          ? (a, b) => Number(a.proposalId) - Number(b.proposalId)
          : (a, b) => Number(b.proposalId) - Number(a.proposalId)
      )
      .slice(offset, limit === undefined ? undefined : offset + limit)

    const eventsWithData = await GovStateEvent.findAll({
      where: {
        id: filteredEvents.map((event) => event.id),
      },
      order: [['proposalId', ascending ? 'ASC' : 'DESC']],
    })

    // If no events found, return undefined.
    if (!eventsWithData.length) {
      return
    }

    // Call hook.
    await onFetch?.(eventsWithData)

    return eventsWithData.map(
      ({ proposalId, data }): FormulaProposalObject => ({
        id: proposalId,
        data,
      })
    )
  }

  const getProposalCount: FormulaProposalCountGetter = async () => {
    const dependentKey =
      getDependentKey(GovStateEvent.dependentKeyNamespace) + ':'
    dependentKeys?.push({
      key: dependentKey,
      prefix: true,
    })

    // Check cache.
    const cachedEvents = cache.events[dependentKey]

    const events =
      // If undefined, we haven't tried to fetch them yet. If not undefined,
      // either they exist or they don't (null).
      cachedEvents !== undefined
        ? ((cachedEvents ?? []) as GovStateEvent[])
        : // Only load ID, proposal ID, and block height, so we can filter
          // properly. This must match the query in `getProposals` since it uses
          // the same cache key.
          await GovStateEvent.findAll({
            attributes: [
              // DISTINCT ON is not directly supported by Sequelize, so we need
              // to cast to unknown and back to string to insert this at the
              // beginning of the query. This ensures we use the most recent
              // version of each proposal.
              Sequelize.literal(
                'DISTINCT ON("proposalId") \'\''
              ) as unknown as string,
              'proposalId',
              'id',
              'blockHeight',
              'blockTimeUnixMs',
            ],
            where: {
              blockHeight: blockHeightFilter,
            },
            order: [
              // Needs to be first so we can use DISTINCT ON.
              ['proposalId', 'ASC'],
              ['blockHeight', 'DESC'],
            ],
          })

    // Type-check. Should never happen assuming dependent key namespaces are
    // unique across different event types.
    if (events.some((event) => !(event instanceof GovStateEvent))) {
      throw new Error('Incorrect event type.')
    }

    // Cache events, null if nonexistent.
    if (cachedEvents === undefined) {
      cache.events[dependentKey] = events.length ? events : null
    }

    // Call hook.
    await onFetch?.(events)

    return events.length
  }

  const getCommunityPoolBalances: FormulaCommunityPoolBalancesGetter =
    async () => {
      const dependentKey = getDependentKey(
        DistributionCommunityPoolStateEvent.dependentKeyNamespace
      )
      dependentKeys?.push({
        key: dependentKey,
        prefix: false,
      })

      // Check cache.
      const cachedEvent = cache.events[dependentKey]
      const event =
        // If undefined, we haven't tried to fetch it yet. If not undefined,
        // either it exists or it doesn't (null).
        cachedEvent !== undefined
          ? cachedEvent?.[0]
          : await DistributionCommunityPoolStateEvent.findOne({
              where: {
                blockHeight: blockHeightFilter,
              },
              order: [['blockHeight', 'DESC']],
            })

      // Type-check. Should never happen assuming dependent key namespaces are
      // unique across different event types.
      if (event && !(event instanceof DistributionCommunityPoolStateEvent)) {
        throw new Error('Incorrect event type.')
      }

      // Cache event, null if nonexistent.
      if (cachedEvent === undefined) {
        cache.events[dependentKey] = event ? [event] : null
      }

      // If no event found, return undefined.
      if (!event) {
        return
      }

      // Call hook.
      await onFetch?.([event])

      return event.balances
    }

  const query: FormulaQuerier = async (query, bindParams) => {
    const db = await loadDb({
      type: DbType.Data,
    })

    return db.query(query, {
      bind: bindParams,
      raw: true,
      type: QueryTypes.SELECT,
    })
  }

  return {
    chainId,
    block,
    date: useBlockDate ? new Date(Number(block.timeUnixMs)) : new Date(),
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

    getContract,
    getCodeIdsForKeys,
    contractMatchesCodeIdKeys,
    getCodeIdKeyForContract,

    getSlashEvents,

    getTxEvents,

    getBalance,
    getBalances,

    getProposal,
    getProposals,
    getProposalCount,

    getCommunityPoolBalances,

    query,
  }
}
