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
