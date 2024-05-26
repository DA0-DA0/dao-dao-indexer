import { WasmCode } from './types'
import { WasmCodeAdapter } from './wasm-code.adapter'

export class WasmCodeService implements WasmCodeAdapter {
  private readonly wasmCodes: WasmCode[]

  constructor(codeIds: Record<string, number[] | undefined> | undefined) {
    if (!codeIds) {
      throw new Error('No code IDs provided.')
    }

    this.wasmCodes = Object.entries(codeIds).map(
      ([codeKey, codeIds]: [string, number[] | undefined]) =>
        new WasmCode(codeKey, codeIds)
    )
  }

  getWasmCodes(): WasmCode[] {
    return this.wasmCodes
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
}
