import { ContractFormula } from '@/types'

import { ContractInfo } from '../types'

export const info: ContractFormula<ContractInfo> = {
  compute: async ({ contractAddress, getTransformationMatch }) => {
    const info = (
      await getTransformationMatch<ContractInfo>(contractAddress, 'info')
    )?.value

    if (!info) {
      throw new Error(`no contract info found for ${contractAddress}`)
    }

    return info
  },
}

export const instantiatedAt: ContractFormula<string> = {
  compute: async ({ contractAddress, getContract }) => {
    const timestamp = (
      await getContract(contractAddress)
    )?.instantiatedAt.timestamp.toISOString()

    if (!timestamp) {
      throw new Error('contract not yet indexed')
    }

    return timestamp
  },
}

// Access any state item. This is either a top-level item or an item
// found as a value in a map. To access an item in a map, use
// keys="map_namespace":"key_in_map" or keys="map_namespace":1 depending on the
// type of the key.
export const item: ContractFormula<any, { key: string; keys: string }> = {
  compute: async ({ contractAddress, get, args: { key, keys } }) => {
    if (key) {
      return await get(contractAddress, key)
    }

    if (keys) {
      const parsedKeys = keys.split(':').map((value) => JSON.parse(value))
      if (
        parsedKeys.some(
          (value) => typeof value !== 'string' && typeof value !== 'number'
        )
      ) {
        throw new Error(
          'keys must be a string of colon-separated values of type string (wrapped in quotes) or number. example: keys="a_string":1'
        )
      }

      return await get(contractAddress, ...parsedKeys)
    }

    throw new Error('missing key or keys')
  },
}

// Access any state map.
export const map: ContractFormula<
  any,
  { key: string; keys: string; numeric: string }
> = {
  compute: async ({
    contractAddress,
    getMap,
    args: { key, keys, numeric },
  }) => {
    if (key) {
      return await getMap(contractAddress, key, {
        keyType: numeric ? 'number' : 'string',
      })
    }

    if (keys) {
      const splitKeys = keys.split(':')
      // Process escaped colons (two in a row), which end up as empty strings
      // sandwiched between two non-empty strings once split.
      const processedKeys: string[] = []
      for (let i = 0; i < splitKeys.length; i++) {
        if (splitKeys[i]) {
          processedKeys.push(splitKeys[i])
        } else if (
          i > 0 &&
          i < splitKeys.length - 1 &&
          splitKeys[i - 1] &&
          splitKeys[i + 1]
        ) {
          processedKeys[processedKeys.length - 1] += ':' + splitKeys[i + 1]
          // Skip an extra item since we just added the next one to the
          // previous.
          i++
        }
      }
      const parsedKeys = processedKeys.map((value) => JSON.parse(value))

      if (
        parsedKeys.some(
          (value) => typeof value !== 'string' && typeof value !== 'number'
        )
      ) {
        throw new Error(
          'keys must contain colon-separated values of type string (wrapped in quotes) or number, with colons escaped as double colons. example: keys="a_string":1 becomes ["a_string", 1], and keys="some::key":"another" becomes ["some:key", "another"]'
        )
      }

      return await getMap(contractAddress, parsedKeys, {
        keyType: numeric ? 'number' : 'string',
      })
    }

    throw new Error('missing key or keys')
  },
}
