import { WasmCode } from './types'

export interface WasmCodeAdapter {
  getWasmCodes(): WasmCode[]
  resetWasmCodes(): void
  exportWasmCodes(): Record<string, number[] | undefined>
  findWasmCodeIdsByKeys(...keys: string[]): number[]
  findWasmCodeKeysById(id: number): string[]
  reloadWasmCodeIdsFromDB(): Promise<void>
}
