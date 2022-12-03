// https://github.com/CosmWasm/cw-storage-plus/blob/179bcd0dc2b769c787f411a7cf9a614a80e4dee0/src/helpers.rs#L57
// Recreate cw-storage-plus key nesting format.
export const base64KeyForKeys = (...keys: string[]): string => {
  const namespaces = keys.slice(0, -1)
  const key = keys.slice(-1)[0]

  // Namespaces prefixed with 2-byte big endian length.
  const namespacesWithLengthBytes = namespaces.reduce(
    (acc, namespace) => acc + namespace.length + 2,
    0
  )
  const buf = Buffer.alloc(namespacesWithLengthBytes + key.length)

  let offset = 0
  for (const namespace of namespaces) {
    buf.writeUInt16BE(namespace.length, offset)
    offset += 2
    buf.write(namespace, offset)
    offset += namespace.length
  }
  buf.write(key, offset)

  return buf.toString('base64')
}
