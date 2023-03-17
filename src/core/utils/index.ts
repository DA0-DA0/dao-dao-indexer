// https://github.com/CosmWasm/cw-storage-plus/blob/179bcd0dc2b769c787f411a7cf9a614a80e4dee0/src/helpers.rs#L57
// Recreate cw-storage-plus key nesting format. Output is a comma-separated list
// of uint8 values that represents a byte array. See `Event` model for more
// information.

import { DependentKeyNamespace } from '@/db'

import { Block, FormulaType, SerializedBlock } from '../types'

// Convert base64 string to comma-separated list of bytes. See explanation in
// `Event` model for the key attribute for more information.
export const base64KeyToEventKey = (key: string): string =>
  Buffer.from(key, 'base64').join(',')

// Convert comma-separated list of bytes to base64 string. See explanation in
// `Event` model for the key attribute for more information.
export const eventKeyToBase64 = (key: string): string =>
  Buffer.from(key.split(',').map((c) => parseInt(c, 10))).toString('base64')

export const dbKeyForKeys = (...keys: (string | number)[]): string => {
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

const keyToBuffer = (key: string | number): Buffer => {
  if (typeof key === 'string') {
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
): (string | number)[] => {
  const buffer = Buffer.from(key.split(',').map((c) => parseInt(c, 10)))
  const keys: (string | number)[] = []
  const addKey = (buffer: Buffer, numeric: boolean) =>
    keys.push(
      numeric ? parseInt(buffer.toString('hex'), 16) : buffer.toString('utf-8')
    )

  const namespaces = withNumericKeys.slice(0, -1)

  let offset = 0
  for (const isNumeric of namespaces) {
    const namespaceLength = buffer.readUInt16BE(offset)
    offset += 2
    const namespace = buffer.subarray(offset, offset + namespaceLength)
    offset += namespaceLength
    addKey(namespace, isNumeric)
  }
  // Add final key.
  addKey(buffer.subarray(offset), withNumericKeys[withNumericKeys.length - 1])

  return keys
}

export const getDependentKey = (
  namespace: DependentKeyNamespace,
  // If empty/undefined, wildcard used.
  ...keys: (string | undefined)[]
) => `${namespace}:${keys.map((key) => key || '*').join(':')}`

export const validateBlockString = (block: string, subject: string): Block => {
  let parsedBlock
  try {
    parsedBlock = block.split(':').map((s) => BigInt(s))
  } catch (err) {
    throw new Error(`${subject}'s values must be integers`)
  }

  if (parsedBlock.length !== 2) {
    throw new Error(`${subject} must be a height:timeUnixMs pair`)
  }

  const [blockHeight, blockTimeUnixMs] = parsedBlock

  if (blockHeight < 1 || blockTimeUnixMs < 0) {
    throw new Error(
      `${subject}'s height must be at least 1 and ${subject}'s timeUnixMs must be at least 0`
    )
  }

  return {
    height: blockHeight,
    timeUnixMs: blockTimeUnixMs,
  }
}

export const FormulaTypeValues = Object.values(FormulaType)
export const typeIsFormulaType = (type: string): type is FormulaType =>
  FormulaTypeValues.includes(type as FormulaType)

export * from './objectMatchesStructure'

// BigInt min and max functions.
export const bigIntMax = (...args: bigint[]) =>
  args.reduce((m, e) => (e > m ? e : m))
export const bigIntMin = (...args: bigint[]) =>
  args.reduce((m, e) => (e < m ? e : m))

// Stringifies bigint fields.
export const serializeBlock = ({
  height,
  timeUnixMs,
}: Block): SerializedBlock => ({
  height: height.toString(),
  timeUnixMs: timeUnixMs.toString(),
})
