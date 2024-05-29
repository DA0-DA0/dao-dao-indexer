import { WasmCode } from './types'

export interface WasmCodeAdapter {
  getWasmCodes(): WasmCode[]
  resetWasmCodes(): void
  exportWasmCodes(): Record<string, number[] | undefined>
  findWasmCodeIdsByKeys(...keys: string[]): number[]
  findWasmCodeKeyById(id: number): string[] | undefined
  extractWasmCodeKeys(input: any): string[]
  loadWasmCodeIdsFromDB(): Promise<WasmCode[]>
  reloadWasmCodes(): Promise<void>
}
