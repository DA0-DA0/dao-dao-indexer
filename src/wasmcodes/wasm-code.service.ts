import { updateConfigCodeIds } from '@/core/config'
import { WasmCodeKey } from '@/db/models/WasmCodeKey'
import { WasmCodeKeyId } from '@/db/models/WasmCodeKeyId'

import { WasmCode } from './types'
import { WasmCodeAdapter } from './wasm-code.adapter'
export class WasmCodeService implements WasmCodeAdapter {
  private wasmCodes: WasmCode[] = []
  private interval: NodeJS.Timeout | undefined

  static instance: WasmCodeService

  private constructor() {}

  static getInstance(): WasmCodeService {
    if (!this.instance) {
      throw new Error('WasmCodeService not initialized')
    }
    return this.instance
  }

  static async newWithWasmCodesFromDB(): Promise<WasmCodeService> {
    if (this.instance) {
      return this.getInstance()
    }

    const wasmCodeService = new WasmCodeService()
    const wasmCodes = await wasmCodeService.loadWasmCodeIdsFromDB()
    wasmCodeService.addWasmCode(wasmCodes)
    await wasmCodeService.updateWasmCodes()
    this.instance = wasmCodeService
    return this.getInstance()
  }

  resetWasmCodes(): void {
    this.wasmCodes = []
  }

  addWasmCode(wasmCodes: WasmCode[]): void {
    this.wasmCodes.push(...wasmCodes)
  }

  getWasmCodes(): WasmCode[] {
    return this.wasmCodes
      .sort((a: WasmCode, b: WasmCode) => a.codeKey.localeCompare(b.codeKey))
      .map(
        (wasmCode: WasmCode) =>
          new WasmCode(wasmCode.codeKey, wasmCode.codeIds?.sort())
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

  findWasmCodeIdsByKeys(...keys: string[]): number[] {
    return keys.flatMap(
      (key: string) =>
        this.wasmCodes.find((wasmCode: WasmCode) => wasmCode.codeKey === key)
          ?.codeIds ?? []
    )
  }

  findWasmCodeKeyById(codeId: number): string[] | undefined {
    return this.wasmCodes
      .filter((wasmCode: WasmCode) => wasmCode.codeIds?.includes(codeId))
      .map((wasmCode: WasmCode) => wasmCode.codeKey)
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

  async updateWasmCodes(): Promise<void> {
    this.interval = setInterval(async () => {
      await this.reloadWasmCodes()
      await updateConfigCodeIds(this.exportWasmCodes())
    }, 2000)
  }

  async stopUpdateWasmCodes(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval)
    }
  }
}
