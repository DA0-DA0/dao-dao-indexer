// https://github.com/CosmWasm/cw-storage-plus/blob/179bcd0dc2b769c787f411a7cf9a614a80e4dee0/src/helpers.rs#L57
// Recreate cw-storage-plus key nesting format. Output is a comma-separated list
// of uint8 values that represents a byte array. See `Event` model for more
// information.
export const dbKeyForKeys = (...keys: string[]): string => {
  const namespaces = keys.slice(0, -1)
  const key = keys.slice(-1)[0]

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
    buffer.write(namespace, offset)
    offset += namespace.length
  }
  buffer.write(key, offset)

  return buffer.join(',')
}

// Convert comma-separated list of uint8 values to a string.
export const dbKeyToString = (key: string): string => {
  return Buffer.from(key.split(',').map((c) => parseInt(c, 10))).toString(
    'utf-8'
  )
}
