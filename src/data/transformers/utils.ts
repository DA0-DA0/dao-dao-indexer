import { ParsedWasmStateEvent, Transformer } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

const defaultGetValue = (event: ParsedWasmStateEvent) =>
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
