import { WasmCode } from './types'

export interface WasmCodeAdapter {
  getWasmCodes(): WasmCode[]
  getWasmCodeAllIds(): number[]
  findWasmCodeIdsByKeys(...keys: string[]): number[]
  findWasmCodeKeyById(id: number): string | undefined
  someWasmKeysHasCodeId(codeId: number | undefined, ...keys: string[]): boolean
  extractWasmCodeKeys(input: any): string[]
}
