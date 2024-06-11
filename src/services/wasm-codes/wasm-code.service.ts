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
      throw new Error(
        'WasmCodeService not initialized because WasmCodeService.setUpInstance was never called'
      )
    }
    return this.instance
  }

  static async setUpInstance(): Promise<WasmCodeService> {
    if (this.instance) {
      return this.instance
    }
    const wasmCodeService = new WasmCodeService()
    await wasmCodeService.reloadWasmCodeIdsFromDB()
    wasmCodeService.startUpdater()
    return wasmCodeService
  }

  resetWasmCodes(): void {
    this.wasmCodes = []
  }

  addWasmCodes(wasmCodes: WasmCode[]): void {
    this.wasmCodes.push(...wasmCodes)
  }

  getWasmCodes(): WasmCode[] {
    return this.wasmCodes
      .map((wasmCode: WasmCode) => {
        wasmCode.codeIds?.sort()
        return wasmCode
      })
      .sort((a: WasmCode, b: WasmCode) => a.codeKey.localeCompare(b.codeKey))
  }

  exportWasmCodes(): Record<string, number[] | undefined> {
    return this.wasmCodes.reduce(
      (
        acc: Record<string, number[] | undefined>,
        wasmCode: WasmCode
      ): Record<string, number[] | undefined> => ({
        ...acc,
        [wasmCode.codeKey]: wasmCode.codeIds?.sort(),
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

  findWasmCodeKeysById(codeId: number): string[] {
    return this.wasmCodes
      .filter((wasmCode: WasmCode) => wasmCode.codeIds?.includes(codeId))
      .map((wasmCode: WasmCode) => wasmCode.codeKey)
  }

  static extractWasmCodeKeys(input: any): string[] {
    if (!input) {
      return []
    }

    if (typeof input !== 'string') {
      return []
    }

    return input.split(',').map((key: string) => key.trim())
  }

  async reloadWasmCodeIdsFromDB(): Promise<void> {
    const wasmCodesFromDB = await WasmCodeKey.findAllWithIds()

    const wasmCodes = wasmCodesFromDB.map(
      (wasmCodeKey: WasmCodeKey) =>
        new WasmCode(
          wasmCodeKey.codeKey,
          wasmCodeKey.codeKeyIds.map(
            (wasmCodeKeyId: WasmCodeKeyId) => wasmCodeKeyId.codeKeyId
          )
        )
    )

    this.resetWasmCodes()
    this.addWasmCodes(wasmCodes)
  }

  startUpdater(): void {
    if (this.interval) {
      return
    }

    this.interval = setInterval(async () => {
      await this.reloadWasmCodeIdsFromDB()
      await updateConfigCodeIds(this.exportWasmCodes())
    }, 2000)
  }

  stopUpdater(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = undefined
    }
  }
}
