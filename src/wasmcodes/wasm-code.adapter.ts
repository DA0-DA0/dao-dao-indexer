import { WasmCode } from './types'

export interface WasmCodeAdapter {
  getWasmCodes(): WasmCode[]
  resetWasmCodes(): void
  exportWasmCodes(): Record<string, number[] | undefined>
  getWasmCodeAllIds(): number[]
  findWasmCodeIdsByKeys(...keys: string[]): number[]
  findWasmCodeKeyById(id: number): string | undefined
  someWasmKeysHasCodeId(codeId: number | undefined, ...keys: string[]): boolean
  extractWasmCodeKeys(input: any): string[]
  loadWasmCodeIdsFromDB(): Promise<WasmCode[]>
  reloadWasmCodes(): Promise<void>
}
