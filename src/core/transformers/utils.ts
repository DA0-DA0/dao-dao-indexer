import { Transformer } from '../types'
import { dbKeyForKeys } from '../utils'

export const makeTransformer = (
  codeIdsKeys: string[],
  name: string,
  keyOrKeys?: string | string[]
): Transformer => {
  const dbKeys = [keyOrKeys || name].flat().map((key) => dbKeyForKeys(key))

  return {
    codeIdsKeys,
    matches: (event) => dbKeys.includes(event.key),
    name,
    getValue: (event) => event.valueJson,
  }
}
