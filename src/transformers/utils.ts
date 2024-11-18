import { ParsedWasmStateEvent, Transformer } from '@/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils'

export const defaultGetValue = (event: ParsedWasmStateEvent) =>
  // If value is null but this is not a delete event, store an empty string
  // instead so this transformation doesn't look like a delete.
  event.valueJson === null && !event.delete ? '' : event.valueJson

export const makeTransformer = (
  codeIdsKeys: string[],
  name: string,
  keyOrKeys?: string | string[]
): Transformer => {
  const dbKeys = [keyOrKeys || name].flat().map((key) => dbKeyForKeys(key))

  return {
    filter: {
      codeIdsKeys,
      matches: (event) => dbKeys.includes(event.key),
    },
    name,
    getValue: defaultGetValue,
  }
}

interface TransformerForMapOptions<V = any> {
  numericKey?: boolean
  getValue?: Transformer<V>['getValue']
}

export const makeTransformerForMap = <V = any>(
  codeIdsKeys: string[],
  mapPrefix: string,
  keyPrefixOrPrefixes: string | string[],
  { numericKey = false, getValue }: TransformerForMapOptions<V> = {}
): Transformer<V> => {
  const dbKeyPrefixes = [keyPrefixOrPrefixes]
    .flat()
    .map((key) => dbKeyForKeys(key, ''))

  return {
    filter: {
      codeIdsKeys,
      matches: (event) =>
        dbKeyPrefixes.some((prefix) => event.key.startsWith(prefix)),
    },
    name: (event) => {
      const [, key] = dbKeyToKeys(event.key, [false, numericKey])
      return `${mapPrefix}:${key}`
    },
    getValue: getValue || defaultGetValue,
  }
}

/**
 * Transform Map<K, ()>, which is just efficient list storage with empty values,
 * to an actual list.
 */
export const makeTransformerForMapList = (
  codeIdsKeys: string[],
  name: string,
  mapKey: string
): Transformer<any[]> => {
  const prefix = dbKeyForKeys(mapKey, '')

  return {
    filter: {
      codeIdsKeys,
      matches: (event) => event.key.startsWith(prefix),
    },
    name,
    getValue: async (event, getLastValue) => {
      const value = (await getLastValue()) || []
      if (!Array.isArray(value)) {
        throw new Error(`Expected array, got ${typeof value}`)
      }

      const [, key] = dbKeyToKeys(event.key, [false, false])

      const curr = [...value]
      if (event.delete) {
        const index = curr.indexOf(key)
        if (index !== -1) {
          curr.splice(index, 1)
        }
      } else {
        curr.push(key)
      }

      return curr
    },
  }
}

/**
 * Transform a cw-storage-plus Snapshot.
 */
export const makeTransformerForSnapshot = ({
  codeIdsKeys,
  name,
  changelogKey,
  numericKey = false,
}: {
  /**
   * The code IDs to filter by.
   */
  codeIdsKeys: string[]
  /**
   * The name of the transformation.
   */
  name: string
  /**
   * The key of the changelog.
   */
  changelogKey: string
  /**
   * Whether or not the snapshot keys are numeric (integers). Defaults to
   * false.
   */
  numericKey?: boolean
}): Transformer => {
  const changelogKeyPrefix = dbKeyForKeys(changelogKey, '')
  const changelogNamePrefix = `${name}:changelog`

  return {
    filter: {
      codeIdsKeys,
      matches: (event) => event.key.startsWith(changelogKeyPrefix),
    },
    name: (event) => {
      // map prefix, key, height
      const [, key, height] = dbKeyToKeys(event.key, [false, numericKey, true])
      return `${changelogNamePrefix}:${
        numericKey ? BigInt(key).toString() : key
      }:${BigInt(height).toString()}`
    },
    getValue: defaultGetValue,
  }
}

/**
 * Transform a cw-storage-plus SnapshotMap.
 */
export const makeTransformersForSnapshotMap = ({
  codeIdsKeys,
  name,
  primaryKey,
  changelogKey,
  numericKey = false,
}: {
  /**
   * The code IDs to filter by.
   */
  codeIdsKeys: string[]
  /**
   * The name of the transformation.
   */
  name: string
  /**
   * The primary key of the map.
   */
  primaryKey: string
  /**
   * The key of the changelog.
   */
  changelogKey: string
  /**
   * Whether or not the snapshot map keys are numeric (integers). Defaults to
   * false.
   */
  numericKey?: boolean
}): Transformer[] => {
  const primaryTransformer = makeTransformerForMap(
    codeIdsKeys,
    name,
    primaryKey,
    { numericKey }
  )

  const snapshotTransformer = makeTransformerForSnapshot({
    codeIdsKeys,
    name,
    changelogKey,
    numericKey,
  })

  return [primaryTransformer, snapshotTransformer]
}

/**
 * Transform a SnapshotVectorMap.
 */
export const makeTransformersForSnapshotVectorMap = ({
  codeIdsKeys,
  name,
  itemsKey,
  nextIdsKey,
  activePrimaryKey,
  activeChangelogKey,
  numericKey = false,
}: {
  /**
   * The code IDs to filter by.
   */
  codeIdsKeys: string[]
  /**
   * The name of the transformation.
   */
  name: string
  /**
   * The key of the items map.
   */
  itemsKey: string
  /**
   * The key of the next IDs map.
   */
  nextIdsKey: string
  /**
   * The key of the active SnapshotMap primary key.
   */
  activePrimaryKey: string
  /**
   * The key of the active SnapshotMap changelog.
   */
  activeChangelogKey: string
  /**
   * Whether or not the keys are numeric (integers). Defaults to false.
   */
  numericKey?: boolean
}): Transformer[] => {
  const itemsKeyPrefix = dbKeyForKeys(itemsKey, '')
  const itemsNamePrefix = `${name}:items`

  const itemsTransformer: Transformer = {
    filter: {
      codeIdsKeys,
      matches: (event) => event.key.startsWith(itemsKeyPrefix),
    },
    name: (event) => {
      // map prefix, key, ID
      const [, key, id] = dbKeyToKeys(event.key, [false, numericKey, true])
      return `${itemsNamePrefix}:${
        numericKey ? BigInt(key).toString() : key
      }:${BigInt(id).toString()}`
    },
    getValue: defaultGetValue,
  }

  const nextIdsTransformer = makeTransformerForMap(
    codeIdsKeys,
    `${name}:nextIds`,
    nextIdsKey,
    {
      numericKey,
    }
  )

  const activeSnapshotMapTransformers = makeTransformersForSnapshotMap({
    codeIdsKeys,
    name: `${name}:active`,
    primaryKey: activePrimaryKey,
    changelogKey: activeChangelogKey,
    numericKey,
  })

  return [
    itemsTransformer,
    nextIdsTransformer,
    ...activeSnapshotMapTransformers,
  ]
}
