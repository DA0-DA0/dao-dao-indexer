import { WasmCodeKey } from '@/db/models/WasmCodeKey'
import { WasmCodeKeyId } from '@/db/models/WasmCodeKeyId'

import { WasmCode } from './types'
import { WasmCodeAdapter } from './wasm-code.adapter'
export class WasmCodeService implements WasmCodeAdapter {
  private wasmCodes: WasmCode[] = []

  constructor(
    codeIds: Record<string, number[] | undefined> | undefined = undefined
  ) {
    if (codeIds) {
      this.addWasmCode(
        Object.entries(codeIds).map(
          ([codeKey, codeIds]: [string, number[] | undefined]) =>
            new WasmCode(codeKey, codeIds)
        )
      )
    }
  }

  static async newWithWasmCodesFromDB(): Promise<WasmCodeService> {
    const wasmCodeService = new WasmCodeService()
    const wasmCodes = await wasmCodeService.loadWasmCodeIdsFromDB()
    wasmCodeService.addWasmCode(wasmCodes)
    return wasmCodeService
  }

  resetWasmCodes(): void {
    this.wasmCodes = []
  }

  addWasmCode(wasmCodes: WasmCode[]): void {
    this.wasmCodes.push(...wasmCodes)
  }

  getWasmCodes(): WasmCode[] {
    return this.wasmCodes.sort((a: WasmCode, b: WasmCode) =>
      a.codeKey.localeCompare(b.codeKey)
    )
  }

  exportWasmCodes(): Record<string, number[] | undefined> {
    return this.wasmCodes.reduce(
      (
        acc: Record<string, number[] | undefined>,
        wasmCode: WasmCode
      ): Record<string, number[] | undefined> => ({
        ...acc,
        [wasmCode.codeKey]: wasmCode.codeIds,
      }),
      {}
    )
  }

  getWasmCodeAllIds(): number[] {
    return this.wasmCodes.flatMap(
      (wasmCode: WasmCode) => wasmCode.codeIds ?? []
    )
  }

  findWasmCodeIdsByKeys(...keys: string[]): number[] {
    return keys.flatMap(
      (key: string) =>
        this.wasmCodes.find((wasmCode: WasmCode) => wasmCode.codeKey === key)
          ?.codeIds ?? []
    )
  }

  findWasmCodeKeyById(codeId: number): string | undefined {
    return this.wasmCodes.find((wasmCode: WasmCode) =>
      wasmCode.codeIds?.includes(codeId)
    )?.codeKey
  }

  someWasmKeysHasCodeId(
    codeId: number | undefined,
    ...keys: string[]
  ): boolean {
    if (!codeId) {
      return false
    }
    return keys.some((key: string) =>
      this.wasmCodes
        .find((wasmCode: WasmCode) => wasmCode.codeKey === key)
        ?.codeIds?.includes(codeId)
    )
  }

  extractWasmCodeKeys(input: any): string[] {
    if (!input) {
      return []
    }

    if (typeof input !== 'string') {
      return []
    }

    return input.split(',').map((key: string) => key.trim())
  }

  async loadWasmCodeIdsFromDB(): Promise<WasmCode[]> {
    return WasmCodeKey.findAllWithIds().then((wasmCodeKeys: WasmCodeKey[]) =>
      wasmCodeKeys.map(
        (wasmCodeKey: WasmCodeKey) =>
          new WasmCode(
            wasmCodeKey.codeKey,
            wasmCodeKey.codeKeyIds.map(
              (wasmCodeKeyId: WasmCodeKeyId) => wasmCodeKeyId.codeKeyId
            )
          )
      )
    )
  }

  async reloadWasmCodes(): Promise<void> {
    const wasmCodes = await this.loadWasmCodeIdsFromDB()
    this.resetWasmCodes()
    this.addWasmCode(wasmCodes)
  }
}
