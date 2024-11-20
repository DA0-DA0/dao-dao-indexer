import { DependentKeyNamespace, KeyInput, KeyInputType } from '@/types'

// Convert base64 string to comma-separated list of bytes. See explanation in
// `Event` model for the key attribute for more information.
export const base64KeyToEventKey = (key: string): string =>
  Buffer.from(key, 'base64').join(',')

// Convert comma-separated list of bytes to base64 string. See explanation in
// `Event` model for the key attribute for more information.
export const eventKeyToBase64 = (key: string): string =>
  Buffer.from(key.split(',').map((c) => parseInt(c, 10))).toString('base64')

// https://github.com/CosmWasm/cw-storage-plus/blob/179bcd0dc2b769c787f411a7cf9a614a80e4dee0/src/helpers.rs#L57
// Recreate cw-storage-plus key nesting format. Output is a comma-separated list
// of uint8 values that represents a byte array. See `Event` model for more
// information.
export const dbKeyForKeys = (...keys: KeyInput[]): string => {
  const bufferKeys = keys.map(keyToBuffer)
  const namespaces = bufferKeys.slice(0, -1)
  const key = bufferKeys.slice(-1)[0]

  // Namespaces prefixed with 2-byte big endian length.
  const namespacesWithLengthBytes = namespaces.reduce(
    (acc, namespace) => acc + namespace.length + 2,
    0
  )
  const buffer = Buffer.alloc(namespacesWithLengthBytes + key.length)

  let offset = 0
  for (const namespace of namespaces) {
    buffer.writeUInt16BE(namespace.length, offset)
    offset += 2
    namespace.copy(buffer, offset)
    offset += namespace.length
  }
  key.copy(buffer, offset)

  return buffer.join(',')
}

export const keyToBuffer = (key: KeyInput): Buffer => {
  if (typeof key === 'string' || key instanceof Uint8Array) {
    return Buffer.from(key)
  }

  // Convert number to 8-byte big endian buffer.
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(key))
  return buffer
}

// Convert comma-separated list of uint8 values in big endian format to an array
// of strings and numbers. `withNumericKeys` must be an array of booleans
// indicating whether the corresponding key should be converted to a number. If
// false, that key is a string. `withNumericKeys` must be the same length as the
// number of keys encoded in `key`.
export const dbKeyToKeys = (
  key: string,
  withNumericKeys: boolean[]
): (string | number)[] =>
  dbKeyToKeysAdvanced(
    key,
    withNumericKeys.map((numeric) => (numeric ? 'number' : 'string'))
  ) as (string | number)[]

export const dbKeyToKeysAdvanced = (
  key: string,
  withTypes: KeyInputType[]
): KeyInput[] => {
  const buffer = Buffer.from(key.split(',').map((c) => parseInt(c, 10)))
  const keys: KeyInput[] = []
  const addKey = (buffer: Buffer, type: 'string' | 'number' | 'bytes') =>
    keys.push(
      type === 'string'
        ? buffer.toString('utf-8')
        : type === 'number'
        ? parseInt(buffer.toString('hex'), 16)
        : new Uint8Array(buffer)
    )

  const namespaces = withTypes.slice(0, -1)

  let offset = 0
  for (const type of namespaces) {
    const namespaceLength = buffer.readUInt16BE(offset)
    offset += 2
    const namespace = buffer.subarray(offset, offset + namespaceLength)
    offset += namespaceLength
    addKey(namespace, type)
  }
  // Add final key.
  addKey(buffer.subarray(offset), withTypes[withTypes.length - 1])

  return keys
}

export const getDependentKey = (
  namespace: DependentKeyNamespace,
  // If empty/undefined, wildcard used.
  ...keys: (string | undefined)[]
) => `${[namespace, ...keys].map((key) => key || '*').join(':')}`
