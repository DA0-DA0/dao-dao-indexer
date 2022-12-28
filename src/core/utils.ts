import { contractFormulas, walletFormulas } from './formulas'
import { ContractFormula, NestedFormulaMap, WalletFormula } from './types'

export const getContractFormula = (
  formulaName: string
): ContractFormula<any, any> | undefined => {
  const formulaPath = formulaName.split('/')
  const formulaBase = formulaPath
    .slice(0, -1)
    .reduce(
      (acc, key) =>
        typeof acc === 'object' && acc[key] ? acc[key] : undefined,
      contractFormulas as
        | NestedFormulaMap<ContractFormula<any, any>>
        | ContractFormula<any, any>
        | undefined
    )

  const formula =
    typeof formulaBase === 'object'
      ? formulaBase[formulaPath[formulaPath.length - 1]]
      : undefined
  return typeof formula === 'function' ? formula : undefined
}

export const getWalletFormula = (
  formulaName: string
): WalletFormula<any, any> | undefined => {
  const formulaPath = formulaName.split('/')
  const formulaBase = formulaPath
    .slice(0, -1)
    .reduce(
      (acc, key) =>
        typeof acc === 'object' && acc[key] ? acc[key] : undefined,
      walletFormulas as
        | NestedFormulaMap<WalletFormula<any, any>>
        | WalletFormula<any, any>
        | undefined
    )

  const formula =
    typeof formulaBase === 'object'
      ? formulaBase[formulaPath[formulaPath.length - 1]]
      : undefined
  return typeof formula === 'function' ? formula : undefined
}

// https://github.com/CosmWasm/cw-storage-plus/blob/179bcd0dc2b769c787f411a7cf9a614a80e4dee0/src/helpers.rs#L57
// Recreate cw-storage-plus key nesting format. Output is a comma-separated list
// of uint8 values that represents a byte array. See `Event` model for more
// information.
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

// Convert comma-separated list of uint8 values to a string.
export const dbKeyToString = (key: string): string => {
  return Buffer.from(key.split(',').map((c) => parseInt(c, 10))).toString(
    'utf-8'
  )
}

// Convert comma-separated list of uint8 values in big endian format to a
// number.
export const dbKeyToNumber = (key: string): number =>
  parseInt(
    Buffer.from(key.split(',').map((c) => parseInt(c, 10))).toString('hex'),
    16
  )
