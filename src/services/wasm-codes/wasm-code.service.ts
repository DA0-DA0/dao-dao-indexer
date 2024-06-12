import { Config, loadConfig } from '@/core'
import { WasmCodeKey } from '@/db/models/WasmCodeKey'
import { WasmCodeKeyId } from '@/db/models/WasmCodeKeyId'

import { WasmCode } from './types'
import { WasmCodeAdapter } from './wasm-code.adapter'
export class WasmCodeService implements WasmCodeAdapter {
  /**
   * Singleton instance.
   */
  static instance: WasmCodeService

  /**
   * Wasm codes that are always added to the list, even when wasm codes are
   * reloaded from the DB.
   */
  private defaultWasmCodes: WasmCode[]

  /**
   * List of all active wasm codes, including the defaults and those loaded from
   * the DB.
   */
  private wasmCodes: WasmCode[]

  /**
   * Interval that updates the list of wasm codes from the DB.
   */
  private refreshInterval: NodeJS.Timeout | undefined

  private constructor(
    /**
     * Wasm codes from the config.
     */
    configWasmCodes: Config['codeIds']
  ) {
    this.defaultWasmCodes = Object.entries(configWasmCodes || {}).flatMap(
      ([key, codeIds]) => (codeIds ? new WasmCode(key, codeIds) : [])
    )
    this.wasmCodes = [...this.defaultWasmCodes]
  }

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

    const config = loadConfig()

    const wasmCodeService = new WasmCodeService(config.codeIds)
    await wasmCodeService.startUpdater()

    return wasmCodeService
  }

  static extractWasmCodeKeys(input: any): string[] {
    if (!input || typeof input !== 'string') {
      return []
    }

    return input.split(',').map((key: string) => key.trim())
  }

  getWasmCodes(): WasmCode[] {
    return this.wasmCodes
  }

  exportWasmCodes(): Record<string, number[]> {
    return Object.fromEntries(
      this.wasmCodes.map((wasmCode: WasmCode) => [
        wasmCode.codeKey,
        wasmCode.codeIds,
      ])
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
      .filter((wasmCode: WasmCode) => wasmCode.codeIds.includes(codeId))
      .map((wasmCode: WasmCode) => wasmCode.codeKey)
  }

  async reloadWasmCodeIdsFromDB(): Promise<void> {
    try {
      const wasmCodesFromDB = await WasmCodeKey.findAllWithIds()

      const dbWasmCodes = wasmCodesFromDB.map(
        (wasmCodeKey: WasmCodeKey) =>
          new WasmCode(
            wasmCodeKey.codeKey,
            wasmCodeKey.codeKeyIds.map(
              (wasmCodeKeyId: WasmCodeKeyId) => wasmCodeKeyId.codeKeyId
            )
          )
      )

      // Reset to defaults.
      this.wasmCodes = [...this.defaultWasmCodes]

      // Merge from DB with existing keys.
      for (const dbWasmCode of dbWasmCodes) {
        let existing = this.wasmCodes.find(
          (code) => code.codeKey === dbWasmCode.codeKey
        )
        if (!existing) {
          existing = new WasmCode(dbWasmCode.codeKey, [])
          this.wasmCodes.push(existing)
        }

        // Add non-existing code ids.
        for (const codeId of dbWasmCode.codeIds) {
          if (!existing.codeIds.includes(codeId)) {
            existing.codeIds.push(codeId)
          }
        }
      }
    } catch (error) {
      console.error('Failed to reload wasm code IDs from DB:', error)
    }
  }

  async startUpdater(): Promise<void> {
    if (this.refreshInterval) {
      return
    }

    this.refreshInterval = setInterval(this.reloadWasmCodeIdsFromDB, 60 * 1000)

    // Initial reload.
    await this.reloadWasmCodeIdsFromDB()
  }

  stopUpdater(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = undefined
    }
  }
}
