import { WasmCode } from './types'

export interface WasmCodeAdapter {
  getWasmCodes(): WasmCode[]
  exportWasmCodes(): Partial<Record<string, number[]>>
  findWasmCodeIdsByKeys(...keys: string[]): number[]
  findWasmCodeKeysById(id: number): string[]
  reloadWasmCodeIdsFromDB(): Promise<void>
}
